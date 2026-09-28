import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import HospitalProgram from "@/models/HospitalProgram";
import PatientMembership from "@/models/PatientMembership";
import RewardBudget from "@/models/RewardBudget";
import RewardCatalogItem from "@/models/RewardCatalogItem";
import CapsuleAward from "@/models/CapsuleAward";

const PROGRAM_BLUEPRINTS = [
  {
    organization: {
      name: "ArkCare City Hospital",
      slug: "arkcare-demo-hospital",
      settings: {
        defaultTimezone: "Asia/Kolkata",
        handoffDueMinutes: 240,
        simulatedCareBenefitPoolInr: 25000,
      },
    },
    program: {
      slug: "carequest-city",
      name: "CareQuest City",
      capsuleName: "City Capsule",
      capsuleSymbol: "CITY",
      visualTheme: { accent: "sage", mascot: "guide" },
      rules: {
        dailyAwardCap: 12,
        activityGoalSteps: 5000,
        activityRewardCapsules: 3,
      },
      blockchain: { enabled: true, tokenId: "1001" },
    },
    budget: 25000,
    catalog: [
      {
        title: "Travel support voucher",
        description: "Demo-funded support for a planned follow-up journey.",
        category: "travel",
        costCapsules: 50,
        programCostInr: 200,
      },
      {
        title: "Care learning pack",
        description: "Accessible patient education bundle for the current care journey.",
        category: "education",
        costCapsules: 8,
        programCostInr: 75,
      },
    ],
  },
  {
    organization: {
      name: "Lotus Heart Institute",
      slug: "lotus-heart-demo",
      settings: {
        defaultTimezone: "Asia/Kolkata",
        handoffDueMinutes: 180,
        simulatedCareBenefitPoolInr: 18000,
      },
    },
    program: {
      slug: "lotus-path",
      name: "Lotus Path",
      capsuleName: "Lotus Capsule",
      capsuleSymbol: "LOTUS",
      visualTheme: { accent: "lavender", mascot: "walker" },
      rules: {
        dailyAwardCap: 10,
        activityGoalSteps: 3500,
        activityRewardCapsules: 2,
      },
      blockchain: { enabled: true, tokenId: "1002" },
    },
    budget: 18000,
    catalog: [
      {
        title: "Follow-up access support",
        description: "Demo support attached to a clinically planned follow-up.",
        category: "follow_up_support",
        costCapsules: 40,
        programCostInr: 150,
      },
      {
        title: "Accessible wellness guide",
        description: "Large-text and audio-friendly wellness education resources.",
        category: "accessibility",
        costCapsules: 15,
        programCostInr: 50,
      },
    ],
  },
  {
    organization: {
      name: "Sunrise Care Hospital",
      slug: "sunrise-care-hospital",
      settings: {
        defaultTimezone: "Asia/Kolkata",
        handoffDueMinutes: 300,
        simulatedCareBenefitPoolInr: 15000,
      },
    },
    program: {
      slug: "sunrise-rising",
      name: "Sunrise Rising",
      capsuleName: "Sunrise Capsule",
      capsuleSymbol: "SUNRISE",
      visualTheme: { accent: "amber", mascot: "guide" },
      rules: {
        dailyAwardCap: 9,
        activityGoalSteps: 4000,
        activityRewardCapsules: 2,
      },
      blockchain: { enabled: true, tokenId: "1003" },
    },
    budget: 15000,
    catalog: [
      {
        title: "Community screening voucher",
        description: "Funded screening support at Sunrise Care Hospital.",
        category: "screening",
        costCapsules: 30,
        programCostInr: 120,
      },
      {
        title: "Family care guide",
        description: "Caregiver-friendly education for the current journey.",
        category: "education",
        costCapsules: 10,
        programCostInr: 60,
      },
    ],
  },
  {
    organization: {
      name: "Metro Health Clinic",
      slug: "metro-health-clinic",
      settings: {
        defaultTimezone: "Asia/Kolkata",
        handoffDueMinutes: 210,
        simulatedCareBenefitPoolInr: 12000,
      },
    },
    program: {
      slug: "metro-steps",
      name: "Metro Steps",
      capsuleName: "Metro Capsule",
      capsuleSymbol: "METRO",
      visualTheme: { accent: "teal", mascot: "walker" },
      rules: {
        dailyAwardCap: 8,
        activityGoalSteps: 4500,
        activityRewardCapsules: 2,
      },
      blockchain: { enabled: true, tokenId: "1004" },
    },
    budget: 12000,
    catalog: [
      {
        title: "Mobility support pass",
        description: "Transport/mobility support for a planned visit.",
        category: "mobility",
        costCapsules: 25,
        programCostInr: 100,
      },
      {
        title: "Wellness starter kit",
        description: "Entry-level wellness bundle for a new patient journey.",
        category: "education",
        costCapsules: 6,
        programCostInr: 40,
      },
    ],
  },
];

export async function ensureDemoHospitalPrograms(patient = null) {
  await connectDB();
  const result = [];

  for (const blueprint of PROGRAM_BLUEPRINTS) {
    const organization = await Organization.findOneAndUpdate(
      { slug: blueprint.organization.slug },
      {
        $setOnInsert: {
          slug: blueprint.organization.slug,
          demo: true,
        },
        $set: {
          name: blueprint.organization.name,
          settings: blueprint.organization.settings,
        },
      },
      { upsert: true, new: true }
    );

    const program = await HospitalProgram.findOneAndUpdate(
      { organization: organization._id, slug: blueprint.program.slug },
      {
        $set: {
          ...blueprint.program,
          organization: organization._id,
          status: "active",
        },
      },
      { upsert: true, new: true }
    );

    const budget = await RewardBudget.findOneAndUpdate(
      { program: program._id },
      {
        $setOnInsert: {
          organization: organization._id,
          program: program._id,
          currency: "INR",
          fundedAmount: blueprint.budget,
          reservedAmount: 0,
          spentAmount: 0,
          status: "active",
        },
      },
      { upsert: true, new: true }
    );

    for (const item of blueprint.catalog) {
      await RewardCatalogItem.findOneAndUpdate(
        { program: program._id, title: item.title },
        {
          $set: {
            ...item,
            organization: organization._id,
            program: program._id,
            active: true,
          },
        },
        { upsert: true, new: true }
      );
    }

    let membership = null;
    if (patient) {
      membership = await PatientMembership.findOneAndUpdate(
        {
          patient: patient._id,
          organization: organization._id,
          program: program._id,
        },
        {
          $setOnInsert: {
            patient: patient._id,
            organization: organization._id,
            program: program._id,
            joinedAt: new Date(),
          },
          $set: { status: "active" },
        },
        { upsert: true, new: true }
      );
    }

    result.push({ organization, program, budget, membership });
  }

  if (patient && result[0]) {
    await CapsuleAward.updateMany(
      {
        patient: patient._id,
        $or: [
          { organization: { $exists: false } },
          { organization: null },
          { program: { $exists: false } },
          { program: null },
        ],
      },
      {
        $set: {
          organization: result[0].organization._id,
          program: result[0].program._id,
        },
      }
    );
  }

  return result;
}

export async function getPrimaryProgramContext(patient = null) {
  const programs = await ensureDemoHospitalPrograms(patient);
  if (!programs.length) throw new Error("No active CareQuest hospital program");
  return programs[0];
}

export async function getProgramForPatient(patient, programId) {
  const programs = await ensureDemoHospitalPrograms(patient);
  const match = programs.find(
    (item) => String(item.program._id) === String(programId)
  );
  if (!match) throw new Error("Hospital program not available to this patient");

  const membership = await PatientMembership.findOne({
    patient: patient._id,
    program: match.program._id,
    organization: match.organization._id,
    status: "active",
  });
  if (!membership) throw new Error("Active program membership required");

  return { ...match, membership };
}

/**
 * Resolve the hospital (organization + its active Capsule program) a doctor
 * belongs to. An appointment booked with a doctor is owned by THAT doctor's
 * hospital, not the patient's primary hospital — otherwise a booking with a
 * doctor from another hospital would not surface in that doctor's (or that
 * hospital's) dashboard, breaking chat/calls and care-plan routing.
 *
 * Falls back to the demo hospital for doctors with no homeOrganization.
 */
export async function getProgramContextForDoctor(doctor) {
  const programs = await ensureDemoHospitalPrograms(null);
  if (!programs.length) throw new Error("No active CareQuest hospital program");

  // 1) The doctor's assigned hospital (User.homeOrganization). This is the
  // authoritative home for a doctor in the network.
  const { default: User } = await import("@/models/User");
  const doctorUser = await User.findById(doctor.userId).lean();
  if (doctorUser?.homeOrganization) {
    const owned = programs.find(
      (item) => String(item.organization._id) === String(doctorUser.homeOrganization)
    );
    if (owned) return owned;
  }

  // 2) Fall back to a doctor membership's organization.
  const { default: CareQuestMembership } = await import("@/models/CareQuestMembership");
  const membership = await CareQuestMembership.findOne({
    user: doctor.userId,
    role: "doctor",
    active: true,
    organization: { $in: programs.map((p) => p.organization._id) },
  });
  if (membership?.organization) {
    const owned = programs.find(
      (item) => String(item.organization._id) === String(membership.organization)
    );
    if (owned) return owned;
  }

  // 3) Default to the first (demo) program.
  return programs[0];
}
