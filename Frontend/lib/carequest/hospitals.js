import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import HospitalProgram from "@/models/HospitalProgram";
import CapsuleAward from "@/models/CapsuleAward";
import CapsuleBalanceProjection from "@/models/CapsuleBalanceProjection";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import PatientMembership from "@/models/PatientMembership";
import AuditEvent from "@/models/AuditEvent";
import Appointment from "@/models/Appointment";
import HandoffCase from "@/models/HandoffCase";
import { verifyAuditChain } from "@/lib/carequest/audit";

/**
 * Hospital reputation = the total participation Capsules earned by a hospital's
 * own patients, together with a small set of quality signals.
 *
 * IMPORTANT SAFETY NOTE: this is a REPUTATION metric, not a claimable balance.
 * Capsules are hospital-specific, non-transferable participation units. A
 * hospital does NOT receive, own, or cash out a share of a patient's capsules.
 * The number is simply "how much care engagement this hospital's cohort has
 * generated", used to rank and surface trustworthy hospitals. The blockchain is
 * a non-clinical proof rail and holds no monetary value.
 */

/**
 * Reputation tiers derived purely from the engagement volume. Deliberately
 * coarse and non-monetary (no INR, no claimable balance).
 */
function reputationTier(totalCapsules) {
  if (totalCapsules >= 400) return { label: "Distinguished", score: 95 };
  if (totalCapsules >= 250) return { label: "Trusted", score: 85 };
  if (totalCapsules >= 120) return { label: "Established", score: 72 };
  if (totalCapsules >= 40) return { label: "Emerging", score: 60 };
  return { label: "New", score: 45 };
}

async function organizationTotals(organizationId) {
  const programs = await HospitalProgram.find({
    organization: organizationId,
    status: "active",
  })
    .select("_id capsuleSymbol capsuleName name rules")
    .lean();

  const programIds = programs.map((program) => program._id);

  const [capsuleAgg, patientCount, doctorCount, appointmentCount, resolvedCases, openCases] =
    await Promise.all([
      programIds.length
        ? CapsuleAward.aggregate([
            { $match: { program: { $in: programIds }, amount: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
        : [],
      programIds.length ? PatientMembership.countDocuments({ program: { $in: programIds } }) : 0,
      Doctor.countDocuments({
        userId: { $in: await doctorUserIdsForOrg(organizationId) },
      }),
      Appointment.countDocuments({ organization: organizationId }),
      HandoffCase.countDocuments({ organization: organizationId, status: "resolved" }),
      HandoffCase.countDocuments({
        organization: organizationId,
        status: { $ne: "resolved" },
      }),
    ]);

  const totalCapsules = capsuleAgg[0]?.total || 0;
  const tier = reputationTier(totalCapsules);

  return {
    totalCapsules,
    tier,
    programCount: programs.length,
    patientCount,
    doctorCount,
    appointmentCount,
    resolvedCases,
    openCases,
  };
}

async function doctorUserIdsForOrg(organizationId) {
  const { default: CareQuestMembership } = await import("@/models/CareQuestMembership");
  const memberships = await CareQuestMembership.find({
    organization: organizationId,
    role: "doctor",
    active: true,
  })
    .select("user")
    .lean();
  return memberships.map((m) => m.user);
}

/**
 * List every active hospital with its reputation and on-chain audit head.
 * Used by the public "Hospitals" directory and the platform (master) console.
 */
export async function getHospitalDirectory() {
  await connectDB();

  const organizations = await Organization.find({}).sort({ name: 1 }).lean();

  const rows = [];
  for (const organization of organizations) {
    const totals = await organizationTotals(organization._id);

    // Per-hospital audit head + integrity: each hospital has its own chain.
    let chainValid = null;
    let headHash = null;
    let chainChecked = 0;
    try {
      const verification = await verifyAuditChain({
        organizationId: organization._id,
        limit: 500,
      });
      chainValid = verification.valid;
      headHash = verification.headHash;
      chainChecked = verification.checked;
    } catch {
      chainValid = null;
    }

    const program = await HospitalProgram.findOne({
      organization: organization._id,
      status: "active",
    })
      .select("capsuleSymbol capsuleName name blockchain.tokenId")
      .lean();

    rows.push({
      organizationId: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      city: organization.settings?.city || null,
      about:
        organization.settings?.about ||
        "A CareQuest hospital running its own clinical and engagement program.",
      symbol: program?.capsuleSymbol || "CAP",
      capsuleName: program?.capsuleName || "CareQuest Capsule",
      tokenId: program?.blockchain?.tokenId || null,
      // Reputation (non-cash)
      totalCapsules: totals.totalCapsules,
      reputationLabel: totals.tier.label,
      reputationScore: totals.tier.score,
      patientCount: totals.patientCount,
      doctorCount: totals.doctorCount,
      appointmentCount: totals.appointmentCount,
      resolvedCases: totals.resolvedCases,
      openCases: totals.openCases,
      // Audit provenance (per-hospital chain head)
      chainValid,
      chainChecked,
      headHash: headHash || null,
    });
  }

  // Rank by reputation, then engagement volume.
  rows.sort(
    (a, b) =>
      b.totalCapsules - a.totalCapsules ||
      b.reputationScore - a.reputationScore ||
      a.name.localeCompare(b.name)
  );

  return rows;
}

/**
 * Single-hospital profile for a hospital admin's own dashboard.
 */
export async function getHospitalProfile(organizationId) {
  await connectDB();
  const organization = await Organization.findById(organizationId).lean();
  if (!organization) return null;

  const directory = await getHospitalDirectory();
  const profile = directory.find(
    (row) => row.organizationId === String(organizationId)
  );

  // Per-patient engagement leaderboard for this hospital (reputation driver).
  const program = await HospitalProgram.findOne({
    organization: organizationId,
    status: "active",
  });

  let leaderboard = [];
  if (program) {
    const rows = await CapsuleAward.aggregate([
      { $match: { program: program._id, amount: { $gt: 0 } } },
      { $group: { _id: "$patient", capsules: { $sum: "$amount" } } },
      { $sort: { capsules: -1 } },
      { $limit: 10 },
    ]);
    const patientIds = rows.map((row) => row._id);
    const patients = await Patient.find({ _id: { $in: patientIds } })
      .select("name")
      .lean();
    const nameById = new Map(patients.map((p) => [String(p._id), p.name]));
    leaderboard = rows.map((row) => ({
      patientId: String(row._id),
      patientName: nameById.get(String(row._id)) || "Patient",
      capsules: row.capsules,
    }));
  }

  return { ...profile, leaderboard };
}

/**
 * Platform (master) console: every hospital, where every audit went, and the
 * network-wide totals. This is the "know everything / master hospital" view.
 */
export async function getPlatformOverview() {
  await connectDB();

  const directory = await getHospitalDirectory();

  const [totalAuditEvents, totalCapsuleAwards, totalHandoffs, recentEvents] =
    await Promise.all([
      AuditEvent.countDocuments({ schemaVersion: 2 }),
      CapsuleAward.aggregate([
        { $match: { amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      HandoffCase.countDocuments({}),
      AuditEvent.find({ schemaVersion: 2 })
        .sort({ createdAt: -1 })
        .limit(40)
        .populate("organization", "name")
        .lean(),
    ]);

  return {
    hospitals: directory,
    networkTotals: {
      hospitalCount: directory.length,
      totalCapsules: totalCapsuleAwards[0]?.total || 0,
      totalAuditEvents,
      totalHandoffs,
      allChainsValid: directory.every((row) => row.chainValid !== false),
    },
    recentEvents: recentEvents.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      resourceType: event.resourceType,
      verificationLevel: event.verificationLevel,
      actorRole: event.actorRole,
      organizationName: event.organization?.name || "Platform",
      organizationId: event.organization ? String(event.organization) : null,
      createdAt: event.createdAt,
    })),
  };
}
