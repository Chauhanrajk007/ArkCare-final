import CapsuleAward from "@/models/CapsuleAward";
import Patient from "@/models/Patient";
import UserPreference from "@/models/UserPreference";
import CapsuleBalanceProjection from "@/models/CapsuleBalanceProjection";
import CapsuleDailyCounter from "@/models/CapsuleDailyCounter";
import HospitalProgram from "@/models/HospitalProgram";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";

export const CAPSULE_RULE_VERSION = 2;
/**
 * Display ceiling for the animated capsule gauge. This is a UI milestone, not
 * a cap on how many Capsules a patient can earn.
 */
export const CAPSULE_DISPLAY_MAX = 2000;
export const CAPSULE_RULES = Object.freeze({
  lesson_completed: { amount: 2, verificationLevel: "system_confirmed" },
  scheduled_response: { amount: 1, verificationLevel: "self_report" },
  follow_up_booked: { amount: 2, verificationLevel: "system_confirmed" },
  follow_up_attended: { amount: 2, verificationLevel: "staff_documented" },
  activity_goal: { amount: 3, verificationLevel: "system_confirmed" },
  // Report knowledge check. The default amount is the completion credit; the
  // caller passes an explicit amount of 1 + correct answers.
  quiz_completed: { amount: 1, verificationLevel: "system_confirmed" },
});

function hospitalDayKey(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return [parts.year, parts.month, parts.day].join("-");
}

async function getAwardPolicy(organizationId, programId) {
  const program = await HospitalProgram.findOne({
    _id: programId,
    organization: organizationId,
    status: "active",
  })
    .populate("organization", "settings.defaultTimezone")
    .lean();

  if (!program) {
    throw new Error("Active hospital Capsule program not found");
  }

  const dailyAwardCap = Number(program.rules?.dailyAwardCap || 0);
  if (!Number.isFinite(dailyAwardCap) || dailyAwardCap < 1) {
    throw new Error("Hospital Capsule program has an invalid daily award cap");
  }

  return {
    dailyAwardCap,
    timezone:
      program.organization?.settings?.defaultTimezone || "Asia/Kolkata",
  };
}

async function reserveDailyAward({
  patient,
  organization,
  program,
  amount,
}) {
  const policy = await getAwardPolicy(organization, program);
  if (amount > policy.dailyAwardCap) {
    throw new Error("Capsule award exceeds this hospital's daily award cap");
  }

  const dayKey = hospitalDayKey(new Date(), policy.timezone);
  const identity = {
    patient,
    organization,
    program,
    dayKey,
  };

  try {
    await CapsuleDailyCounter.findOneAndUpdate(
      identity,
      {
        $setOnInsert: {
          ...identity,
          awarded: 0,
        },
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    // Concurrent first-use inserts converge on the unique patient/program/day key.
    if (error?.code !== 11000) throw error;
  }

  const reserved = await CapsuleDailyCounter.findOneAndUpdate(
    {
      ...identity,
      awarded: {
        $lte: policy.dailyAwardCap - amount,
      },
    },
    { $inc: { awarded: amount } },
    { new: true }
  );

  if (!reserved) {
    throw new Error(
      "Daily Capsule cap reached for this hospital program. New rewards resume on the next local calendar day."
    );
  }

  return {
    counterId: reserved._id,
    amount,
    dayKey,
    dailyAwardCap: policy.dailyAwardCap,
  };
}

async function releaseDailyAwardReservation(reservation) {
  if (!reservation?.counterId || !reservation?.amount) return;
  await CapsuleDailyCounter.updateOne(
    {
      _id: reservation.counterId,
      awarded: { $gte: reservation.amount },
    },
    { $inc: { awarded: -reservation.amount } }
  );
}

export async function ensureCapsuleBalanceProjection(
  patient,
  organization,
  program
) {
  let projection = await CapsuleBalanceProjection.findOne({
    patient,
    organization,
    program,
  });
  if (projection) return projection;

  const [summary] = await CapsuleAward.aggregate([
    {
      $match: {
        patient,
        organization,
        program,
      },
    },
    {
      $group: {
        _id: null,
        balance: { $sum: "$amount" },
        lifetimeEarned: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$eventType", "award"] }, { $gt: ["$amount", 0] }] },
              "$amount",
              0,
            ],
          },
        },
        lifetimeRedeemed: {
          $sum: {
            $cond: [
              { $eq: ["$eventType", "redemption"] },
              { $abs: "$amount" },
              0,
            ],
          },
        },
      },
    },
  ]);

  try {
    projection = await CapsuleBalanceProjection.create({
      patient,
      organization,
      program,
      balance: Number(summary?.balance || 0),
      lifetimeEarned: Number(summary?.lifetimeEarned || 0),
      lifetimeRedeemed: Number(summary?.lifetimeRedeemed || 0),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    projection = await CapsuleBalanceProjection.findOne({
      patient,
      organization,
      program,
    });
  }

  return projection;
}

export async function awardCapsules({
  patient,
  organization = null,
  program = null,
  ruleId,
  sourceType,
  sourceId,
  actorUserId,
  actorRole,
  verificationLevel,
  amount = null,
}) {
  const rule = CAPSULE_RULES[ruleId];
  if (!rule) throw new Error("Unknown Capsule rule");

  const patientRecord = await Patient.findById(patient).select("userId").lean();
  if (patientRecord?.userId) {
    const preference = await UserPreference.findOne({
      userId: patientRecord.userId,
    }).lean();
    if (preference?.careQuestOptIn === false) {
      return { award: null, created: false, optedOut: true };
    }
  }

  let organizationId = organization;
  let programId = program;
  if (!organizationId || !programId) {
    const context = await getPrimaryProgramContext(patientRecord || { _id: patient });
    organizationId = context.organization._id;
    programId = context.program._id;
  }

  await ensureCapsuleBalanceProjection(patient, organizationId, programId);

  const idempotencyKey = [
    String(patient),
    String(organizationId),
    String(programId),
    String(sourceId),
    ruleId,
    "v" + CAPSULE_RULE_VERSION,
  ].join(":");

  let award = await CapsuleAward.findOne({ idempotencyKey });
  if (award) return { award, created: false };

  const hasExplicitAmount = amount !== null && amount !== undefined;
  const awardAmount = hasExplicitAmount ? Number(amount) : rule.amount;
  if (!Number.isFinite(awardAmount) || awardAmount <= 0) {
    throw new Error("Capsule award amount must be a positive number");
  }

  const dailyReservation = await reserveDailyAward({
    patient,
    organization: organizationId,
    program: programId,
    amount: awardAmount,
  });

  try {
    award = await CapsuleAward.create({
      patient,
      organization: organizationId,
      program: programId,
      ruleId,
      ruleVersion: CAPSULE_RULE_VERSION,
      sourceType,
      sourceId: String(sourceId),
      amount: awardAmount,
      verificationLevel: verificationLevel || rule.verificationLevel,
      idempotencyKey,
      blockchain: {
        status:
          process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true" ? "pending" : "disabled",
      },
    });
  } catch (error) {
    await releaseDailyAwardReservation(dailyReservation);
    if (error?.code === 11000) {
      award = await CapsuleAward.findOne({ idempotencyKey });
      return { award, created: false };
    }
    throw error;
  }

  await CapsuleBalanceProjection.updateOne(
    {
      patient,
      organization: organizationId,
      program: programId,
    },
    {
      $inc: {
        balance: award.amount,
        lifetimeEarned: Math.max(0, Number(award.amount || 0)),
      },
    }
  );

  await appendAuditEvent({
    organizationId,
    programId,
    actorUserId,
    actorRole,
    eventType: "capsule.awarded",
    resourceType: "CapsuleAward",
    resourceId: award._id,
    verificationLevel: award.verificationLevel,
    metadata: {
      organizationId: String(organizationId),
      programId: String(programId),
      ruleId,
      ruleVersion: CAPSULE_RULE_VERSION,
      amount: award.amount,
      sourceType,
      sourceId: String(sourceId),
      dailyCap: dailyReservation.dailyAwardCap,
      dailyCapDayKey: dailyReservation.dayKey,
    },
  });

  return { award, created: true };
}

export async function getCapsuleBalance(patientId, programId = null) {
  const match = { patient: patientId };
  if (programId) match.program = programId;

  const [result] = await CapsuleAward.aggregate([
    { $match: match },
    { $group: { _id: "$patient", balance: { $sum: "$amount" } } },
  ]);
  return result?.balance || 0;
}

export function getSimulatedBenefitEligibility(balance) {
  if (balance >= 80) return { tier: "support-80", modeledInr: 350 };
  if (balance >= 50) return { tier: "travel-50", modeledInr: 200 };
  if (balance >= 30) return { tier: "care-30", modeledInr: 100 };
  return { tier: "none", modeledInr: 0 };
}

export async function reverseCapsuleAward({
  awardId,
  reason,
  actorUserId,
  actorRole,
}) {
  const cleanReason = String(reason || "").trim().slice(0, 2000);
  if (!cleanReason) throw new Error("A documented correction reason is required");

  const original = await CapsuleAward.findOne({
    _id: awardId,
    eventType: "award",
  });
  if (!original) throw new Error("Original Capsule award not found");

  await ensureCapsuleBalanceProjection(
    original.patient,
    original.organization,
    original.program
  );

  const idempotencyKey = "reversal:" + String(original._id);
  let reversal = await CapsuleAward.findOne({ idempotencyKey });
  if (reversal) return { reversal, created: false };

  reversal = await CapsuleAward.create({
    patient: original.patient,
    organization: original.organization,
    program: original.program,
    ruleId: original.ruleId,
    ruleVersion: original.ruleVersion,
    sourceType: "CapsuleAwardCorrection",
    sourceId: String(original._id),
    amount: -Math.abs(original.amount),
    verificationLevel: "staff_documented",
    idempotencyKey,
    eventType: "reversal",
    reversalOf: original._id,
    blockchain: {
      status:
        process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true" ? "pending" : "disabled",
    },
  });

  await CapsuleBalanceProjection.updateOne(
    {
      patient: original.patient,
      organization: original.organization,
      program: original.program,
    },
    { $inc: { balance: reversal.amount } }
  );

  await appendAuditEvent({
    organizationId: original.organization,
    programId: original.program,
    actorUserId,
    actorRole,
    eventType: "capsule.reversed",
    resourceType: "CapsuleAward",
    resourceId: reversal._id,
    verificationLevel: "staff_documented",
    metadata: {
      organizationId: String(original.organization || ""),
      programId: String(original.program || ""),
      originalAwardId: String(original._id),
      amount: reversal.amount,
      reason: cleanReason,
    },
  });

  return { reversal, created: true };
}
