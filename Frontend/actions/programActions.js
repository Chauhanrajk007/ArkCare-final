"use server";

import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import CapsuleAward from "@/models/CapsuleAward";
import RewardCatalogItem from "@/models/RewardCatalogItem";
import RewardBudget from "@/models/RewardBudget";
import Redemption from "@/models/Redemption";
import PatientMembership from "@/models/PatientMembership";
import CapsuleBalanceProjection from "@/models/CapsuleBalanceProjection";
import { ensureDemoHospitalPrograms, getProgramForPatient } from "@/lib/carequest/programs";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { ensureCapsuleBalanceProjection } from "@/lib/carequest/capsules";

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function requirePatientContext() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");
  return { user, patient };
}

async function balanceFor(patientId, programId) {
  const [row] = await CapsuleAward.aggregate([
    { $match: { patient: patientId, program: programId } },
    { $group: { _id: "$program", balance: { $sum: "$amount" } } },
  ]);
  return row?.balance || 0;
}

export async function getCarePassport() {
  const { patient } = await requirePatientContext();
  const contexts = await ensureDemoHospitalPrograms(patient);
  const cards = [];

  for (const context of contexts) {
    const [balance, catalog, redemptions] = await Promise.all([
      balanceFor(patient._id, context.program._id),
      RewardCatalogItem.find({
        program: context.program._id,
        active: true,
      }).sort({ costCapsules: 1 }).lean(),
      Redemption.find({
        patient: patient._id,
        program: context.program._id,
        status: "confirmed",
      })
        .populate("catalogItem", "title")
        .sort({ redeemedAt: -1 })
        .limit(8)
        .lean(),
    ]);

    cards.push({
      organization: context.organization,
      program: context.program,
      membership: context.membership,
      balance,
      catalog,
      redemptions,
    });
  }

  return serialize({ patient: { name: patient.name }, programs: cards });
}

export async function updateProgramActivityConsent(programId, consent) {
  const { patient } = await requirePatientContext();
  const context = await getProgramForPatient(patient, programId);

  const membership = await PatientMembership.findOneAndUpdate(
    {
      patient: patient._id,
      organization: context.organization._id,
      program: context.program._id,
    },
    { $set: { "consents.simulatedActivityData": Boolean(consent) } },
    { new: true }
  );

  return serialize(membership);
}

export async function redeemCareBenefit(programId, catalogItemId, requestKey) {
  const { user, patient } = await requirePatientContext();
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(String(requestKey || ""))) {
    throw new Error("A valid redemption request key is required");
  }

  const context = await getProgramForPatient(patient, programId);
  const existing = await Redemption.findOne({ redemptionKey: requestKey }).lean();
  if (existing) return serialize({ redemption: existing, duplicate: true });

  const item = await RewardCatalogItem.findOne({
    _id: catalogItemId,
    organization: context.organization._id,
    program: context.program._id,
    active: true,
  });
  if (!item) throw new Error("Benefit is not available in this hospital program");

  if (item.inventoryLimit && item.redeemedCount >= item.inventoryLimit) {
    throw new Error("This benefit has reached its available inventory");
  }

  const projection = await ensureCapsuleBalanceProjection(
    patient._id,
    context.organization._id,
    context.program._id
  );
  const reservedBalance = await CapsuleBalanceProjection.findOneAndUpdate(
    {
      _id: projection._id,
      balance: { $gte: item.costCapsules },
    },
    {
      $inc: {
        balance: -item.costCapsules,
        lifetimeRedeemed: item.costCapsules,
      },
    },
    { new: true }
  );
  if (!reservedBalance) {
    throw new Error("Not enough hospital-specific Capsules for this benefit");
  }

  const budget = await RewardBudget.findOneAndUpdate(
    {
      program: context.program._id,
      status: "active",
      $expr: {
        $gte: [
          { $subtract: ["$fundedAmount", "$spentAmount"] },
          item.programCostInr,
        ],
      },
    },
    { $inc: { spentAmount: item.programCostInr } },
    { new: true }
  );
  if (!budget) {
    await CapsuleBalanceProjection.updateOne(
      { _id: projection._id },
      {
        $inc: {
          balance: item.costCapsules,
          lifetimeRedeemed: -item.costCapsules,
        },
      }
    );
    throw new Error("This hospital's funded reward budget cannot cover the redemption");
  }

  const inventoryQuery = { _id: item._id, active: true };
  if (item.inventoryLimit) {
    inventoryQuery.redeemedCount = { $lt: item.inventoryLimit };
  }

  const reservedItem = await RewardCatalogItem.findOneAndUpdate(
    inventoryQuery,
    { $inc: { redeemedCount: 1 } },
    { new: true }
  );

  if (!reservedItem) {
    await Promise.all([
      RewardBudget.updateOne(
        { _id: budget._id },
        { $inc: { spentAmount: -item.programCostInr } }
      ),
      CapsuleBalanceProjection.updateOne(
        { _id: projection._id },
        {
          $inc: {
            balance: item.costCapsules,
            lifetimeRedeemed: -item.costCapsules,
          },
        }
      ),
    ]);
    throw new Error("This benefit has reached its available inventory");
  }

  let redemption = null;
  try {
    redemption = await Redemption.create({
      redemptionKey: requestKey,
      patient: patient._id,
      organization: context.organization._id,
      program: context.program._id,
      catalogItem: item._id,
      capsulesSpent: item.costCapsules,
      programCostInr: item.programCostInr,
    });

    await CapsuleAward.create({
      patient: patient._id,
      organization: context.organization._id,
      program: context.program._id,
      ruleId: "benefit_redemption",
      ruleVersion: 1,
      sourceType: "Redemption",
      sourceId: String(redemption._id),
      amount: -Math.abs(item.costCapsules),
      verificationLevel: "system_confirmed",
      idempotencyKey: "redemption:" + requestKey,
      eventType: "redemption",
      blockchain: {
        status:
          process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true"
            ? "pending"
            : "disabled",
      },
    });
  } catch (error) {
    const compensation = [
      RewardBudget.updateOne(
        { _id: budget._id },
        { $inc: { spentAmount: -item.programCostInr } }
      ),
      CapsuleBalanceProjection.updateOne(
        { _id: projection._id },
        {
          $inc: {
            balance: item.costCapsules,
            lifetimeRedeemed: -item.costCapsules,
          },
        }
      ),
      RewardCatalogItem.updateOne(
        { _id: item._id, redeemedCount: { $gt: 0 } },
        { $inc: { redeemedCount: -1 } }
      ),
    ];

    if (redemption?._id) {
      compensation.push(
        Redemption.deleteOne({ _id: redemption._id, redemptionKey: requestKey })
      );
    }

    await Promise.all(compensation);

    if (error?.code === 11000) {
      const duplicate = await Redemption.findOne({
        redemptionKey: requestKey,
      }).lean();
      if (duplicate) {
        return serialize({ redemption: duplicate, duplicate: true });
      }
    }

    throw error;
  }

  await appendAuditEvent({
    organizationId: context.organization._id,
    programId: context.program._id,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "benefit.redeemed",
    resourceType: "Redemption",
    resourceId: redemption._id,
    verificationLevel: "system_confirmed",
    metadata: {
      organizationId: String(context.organization._id),
      programId: String(context.program._id),
      capsulesSpent: item.costCapsules,
      fundedProgramCostInr: item.programCostInr,
    },
  });

  return serialize({
    redemption,
    newBalance: reservedBalance.balance,
    requestReceipt: crypto.createHash("sha256").update(requestKey).digest("hex").slice(0, 12),
  });
}
