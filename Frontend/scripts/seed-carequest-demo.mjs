import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FRONTEND = path.resolve(HERE, "..");
const ROOT = path.resolve(FRONTEND, "..");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Load .env.local FIRST so a local MONGODB_URI wins over the committed
// Atlas fallback in the repository-root arkcare.env.
for (const file of [
  path.join(FRONTEND, ".env.local"),
  path.join(FRONTEND, ".env"),
  path.join(ROOT, "arkcare.env"),
]) {
  loadEnvFile(file);
}

if (!process.env.MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is required. Configure it in the existing local ArkCare environment."
  );
}

const DEMO_PASSWORD = "DemoOnly!123";

const DEMO_DOCTORS = [
  {
    key: "aisha-rahman",
    name: "Dr. Aisha Rahman",
    email: "demo.doctor@arkcare.local",
    phone: "+91 98000 00001",
    specialization: "Cardiology",
    category: "cardiology",
    experience: 12,
    qualifications: ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
    consultationFee: 1200,
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    slots: ["10:00", "11:00", "12:00", "16:00", "17:00"],
  },
  {
    key: "arjun-mehta",
    name: "Dr. Arjun Mehta",
    email: "demo.doctor.cardiology2@arkcare.local",
    phone: "+91 98000 00002",
    specialization: "Interventional Cardiology",
    category: "cardiology",
    experience: 15,
    qualifications: ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
    consultationFee: 1600,
    days: ["Monday", "Wednesday", "Friday"],
    slots: ["09:00", "10:00", "14:00", "15:00"],
  },
  {
    key: "kavya-iyer",
    name: "Dr. Kavya Iyer",
    email: "demo.doctor.general@arkcare.local",
    phone: "+91 98000 00003",
    specialization: "General Medicine",
    category: "general medicine",
    experience: 10,
    qualifications: ["MBBS", "MD (General Medicine)"],
    consultationFee: 900,
    days: ["Monday", "Tuesday", "Thursday", "Saturday"],
    slots: ["09:30", "10:30", "12:30", "16:30"],
  },
  {
    key: "neha-kapoor",
    name: "Dr. Neha Kapoor",
    email: "demo.doctor.dermatology@arkcare.local",
    phone: "+91 98000 00004",
    specialization: "Dermatology",
    category: "dermatology",
    experience: 9,
    qualifications: ["MBBS", "MD (Dermatology)"],
    consultationFee: 1100,
    days: ["Tuesday", "Thursday", "Saturday"],
    slots: ["10:00", "11:00", "14:00", "16:00"],
  },
  {
    key: "rohan-shah",
    name: "Dr. Rohan Shah",
    email: "demo.doctor.neurology@arkcare.local",
    phone: "+91 98000 00005",
    specialization: "Neurology",
    category: "neurology",
    experience: 14,
    qualifications: ["MBBS", "MD (Medicine)", "DM (Neurology)"],
    consultationFee: 1800,
    days: ["Monday", "Wednesday", "Friday"],
    slots: ["11:00", "12:00", "15:00", "17:00"],
  },
  {
    key: "meera-nair",
    name: "Dr. Meera Nair",
    email: "demo.doctor.pediatrics@arkcare.local",
    phone: "+91 98000 00006",
    specialization: "Pediatrics",
    category: "pediatrics",
    experience: 11,
    qualifications: ["MBBS", "MD (Pediatrics)"],
    consultationFee: 1000,
    days: ["Monday", "Tuesday", "Friday", "Saturday"],
    slots: ["09:00", "10:00", "13:00", "16:00"],
  },
  {
    key: "siddharth-rao",
    name: "Dr. Siddharth Rao",
    email: "demo.doctor.orthopedics@arkcare.local",
    phone: "+91 98000 00007",
    specialization: "Orthopedics",
    category: "orthopedics",
    experience: 13,
    qualifications: ["MBBS", "MS (Orthopedics)"],
    consultationFee: 1400,
    days: ["Tuesday", "Wednesday", "Friday"],
    slots: ["10:00", "12:00", "14:00", "17:00"],
  },
  {
    key: "ananya-sen",
    name: "Dr. Ananya Sen",
    email: "demo.doctor.psychiatry@arkcare.local",
    phone: "+91 98000 00008",
    specialization: "Psychiatry",
    category: "psychiatry",
    experience: 10,
    qualifications: ["MBBS", "MD (Psychiatry)"],
    consultationFee: 1500,
    days: ["Monday", "Thursday", "Saturday"],
    slots: ["10:00", "11:30", "15:00", "16:30"],
  },
  {
    key: "vikram-joshi",
    name: "Dr. Vikram Joshi",
    email: "demo.doctor.ent@arkcare.local",
    phone: "+91 98000 00009",
    specialization: "ENT",
    category: "ENT",
    experience: 12,
    qualifications: ["MBBS", "MS (ENT)"],
    consultationFee: 1200,
    days: ["Monday", "Wednesday", "Friday"],
    slots: ["09:00", "11:00", "14:00", "16:00"],
  },
  {
    key: "deepika-rao",
    name: "Dr. Deepika Rao",
    email: "demo.doctor.gynecology@arkcare.local",
    phone: "+91 98000 00010",
    specialization: "Gynecology",
    category: "gynecology",
    experience: 14,
    qualifications: ["MBBS", "MS (Obstetrics & Gynecology)"],
    consultationFee: 1500,
    days: ["Tuesday", "Thursday", "Saturday"],
    slots: ["09:00", "10:30", "14:30", "16:00"],
  },
  {
    key: "farah-khan",
    name: "Dr. Farah Khan",
    email: "demo.doctor.endocrinology@arkcare.local",
    phone: "+91 98000 00011",
    specialization: "Endocrinology",
    category: "endocrinology",
    experience: 13,
    qualifications: ["MBBS", "MD (Medicine)", "DM (Endocrinology)"],
    consultationFee: 1700,
    days: ["Monday", "Thursday", "Friday"],
    slots: ["10:00", "12:00", "15:00", "17:00"],
  },
  {
    key: "aditya-menon",
    name: "Dr. Aditya Menon",
    email: "demo.doctor.pulmonology@arkcare.local",
    phone: "+91 98000 00012",
    specialization: "Pulmonology",
    category: "pulmonology",
    experience: 12,
    qualifications: ["MBBS", "MD (Pulmonary Medicine)"],
    consultationFee: 1350,
    days: ["Tuesday", "Wednesday", "Saturday"],
    slots: ["09:30", "11:00", "14:00", "16:30"],
  },
  {
    key: "isha-banerjee",
    name: "Dr. Isha Banerjee",
    email: "demo.doctor.gastro@arkcare.local",
    phone: "+91 98000 00013",
    specialization: "Gastroenterology",
    category: "gastroenterology",
    experience: 15,
    qualifications: ["MBBS", "MD (Medicine)", "DM (Gastroenterology)"],
    consultationFee: 1750,
    days: ["Monday", "Wednesday", "Saturday"],
    slots: ["10:00", "11:00", "15:00", "17:00"],
  },
];

const now = new Date();
const DAY = 24 * 60 * 60 * 1000;

function ago(days, hours = 0) {
  return new Date(now.getTime() - days * DAY - hours * 60 * 60 * 1000);
}

function ahead(days, hours = 0) {
  return new Date(now.getTime() + days * DAY + hours * 60 * 60 * 1000);
}

function objectIdFor(label) {
  const hex = crypto.createHash("sha256").update(label).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hospitalDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value])
  );
  return [parts.year, parts.month, parts.day].join("-");
}

const medicalReports = [
  {
    patient_info: { name: "Demo Patient", age: "34", sex: "Other" },
    report_type: "blood",
    source_filename: "01_demo_cbc_metabolic_panel.pdf",
    test_results: [
      { test_name: "Hemoglobin", value: "14.2", unit: "g/dL", reference_range: "12.0-16.0" },
      { test_name: "WBC", value: "7.1", unit: "x10^3/uL", reference_range: "4.0-11.0" },
      { test_name: "Platelets", value: "268", unit: "x10^3/uL", reference_range: "150-450" },
      { test_name: "Fasting Glucose", value: "108", unit: "mg/dL", reference_range: "70-99" },
      { test_name: "Creatinine", value: "0.9", unit: "mg/dL", reference_range: "0.6-1.2" },
      { test_name: "Sodium", value: "140", unit: "mmol/L", reference_range: "135-145" },
      { test_name: "Potassium", value: "4.2", unit: "mmol/L", reference_range: "3.5-5.1" },
      { test_name: "ALT", value: "28", unit: "U/L", reference_range: "7-56" },
    ],
    summary:
      "Synthetic demo report. CBC values are within the listed reference ranges. Fasting glucose is mildly above the report reference range; all other listed metabolic values are within range.",
    doctor_notes: "Synthetic data for ArkCare testing only.",
  },
  {
    patient_info: { name: "Demo Patient", age: "34", sex: "Other" },
    report_type: "blood",
    source_filename: "02_demo_lipid_hba1c.pdf",
    test_results: [
      { test_name: "Total Cholesterol", value: "212", unit: "mg/dL", reference_range: "125-200" },
      { test_name: "LDL Cholesterol", value: "139", unit: "mg/dL", reference_range: "0-129" },
      { test_name: "HDL Cholesterol", value: "48", unit: "mg/dL", reference_range: "40-60" },
      { test_name: "Triglycerides", value: "124", unit: "mg/dL", reference_range: "0-149" },
      { test_name: "HbA1c", value: "5.9", unit: "%", reference_range: "4.0-5.6" },
    ],
    summary:
      "Synthetic demo report. Total cholesterol, LDL and HbA1c are above the listed laboratory reference ranges. HDL and triglycerides are within the stated ranges.",
    doctor_notes: "Use only to test report parsing and clinician-review workflows.",
  },
  {
    patient_info: { name: "Demo Patient", age: "34", sex: "Other" },
    report_type: "blood",
    source_filename: "03_demo_thyroid_renal_panel.pdf",
    test_results: [
      { test_name: "TSH", value: "3.1", unit: "uIU/mL", reference_range: "0.4-4.0" },
      { test_name: "Free T4", value: "1.2", unit: "ng/dL", reference_range: "0.8-1.8" },
      { test_name: "Blood Urea Nitrogen", value: "13", unit: "mg/dL", reference_range: "7-20" },
      { test_name: "Creatinine", value: "0.9", unit: "mg/dL", reference_range: "0.6-1.2" },
      { test_name: "eGFR", value: "98", unit: "mL/min/1.73m2", reference_range: "60-140" },
    ],
    summary:
      "Synthetic demo report. Thyroid and renal markers shown here are within the listed reference ranges.",
    doctor_notes: "Synthetic data for testing only.",
  },
  {
    patient_info: { name: "Demo Patient", age: "34", sex: "Other" },
    report_type: "urine",
    source_filename: "04_demo_urinalysis.pdf",
    test_results: [
      { test_name: "Specific Gravity", value: "1.018", unit: "", reference_range: "1.005-1.030" },
      { test_name: "pH", value: "6.0", unit: "", reference_range: "5.0-8.0" },
      { test_name: "Protein", value: "Negative", unit: "", reference_range: "Negative" },
      { test_name: "Glucose", value: "Negative", unit: "", reference_range: "Negative" },
      { test_name: "Ketones", value: "Negative", unit: "", reference_range: "Negative" },
      { test_name: "Blood", value: "Negative", unit: "", reference_range: "Negative" },
    ],
    summary:
      "Synthetic demo urinalysis. The listed urine values are unremarkable for the supplied reference text.",
    doctor_notes: "Synthetic data for ArkCare parser testing.",
  },
  {
    patient_info: { name: "Demo Patient", age: "34", sex: "Other" },
    report_type: "other",
    source_filename: "05_demo_visit_summary.pdf",
    test_results: [
      { test_name: "Resting Heart Rate", value: "76", unit: "bpm", reference_range: "60-100" },
      { test_name: "Blood Pressure Systolic", value: "124", unit: "mmHg", reference_range: "90-129" },
      { test_name: "Blood Pressure Diastolic", value: "78", unit: "mmHg", reference_range: "60-84" },
    ],
    summary:
      "Synthetic outpatient visit summary for a stable cardiology follow-up. No emergency finding is represented. The record includes a planned follow-up, educational tasks and instructions to contact the care team if support is needed.",
    doctor_notes:
      "No real diagnosis or prescription. This file exists only to test ArkCare medical-record ingestion and CareQuest plan drafting.",
  },
];

const labSummary = [
  "SYNTHETIC DEMO MEDICAL RECORD - not real patient data.",
  "CBC values are within listed ranges.",
  "Fasting glucose 108 mg/dL, HbA1c 5.9%, total cholesterol 212 mg/dL and LDL 139 mg/dL are above the example report ranges.",
  "Thyroid, renal and urinalysis demo panels are otherwise within their listed ranges.",
  "A synthetic cardiology follow-up is planned; no real diagnosis or medication instruction is implied.",
].join(" ");

const patientDescription = {
  synthetic_demo: true,
  demographics: {
    age: 34,
    sex: "Other",
    city: "Bengaluru",
  },
  care_context:
    "Synthetic CareQuest demo patient used for report parsing, clinician plan review, reminders, handoffs, rewards and audit testing.",
  allergies: ["No known allergies - synthetic demo entry"],
  medications: [
    "No active prescription seeded. Medication decisions remain clinician-controlled.",
  ],
  lab_summary: labSummary,
  last_lab_update: now.toISOString(),
};

async function ensureSyntheticDoctor(db, profile) {
  let user = await db.collection("users").findOne({ email: profile.email });

  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const _id =
      profile.email === "demo.doctor@arkcare.local"
        ? objectIdFor("arkcare-demo-user:doctor")
        : objectIdFor("arkcare-demo-doctor-user:" + profile.key);

    await db.collection("users").insertOne({
      _id,
      name: profile.name,
      email: profile.email,
      passwordHash,
      role: "doctor",
      gender: "other",
      createdAt: now,
      updatedAt: now,
    });
    user = await db.collection("users").findOne({ _id });
  } else {
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          name: profile.name,
          role: "doctor",
          updatedAt: now,
        },
      }
    );
    user = await db.collection("users").findOne({ _id: user._id });
  }

  const availability = profile.days.map((day) => ({
    day,
    slots: profile.slots,
  }));

  await db.collection("doctors").updateOne(
    { userId: String(user._id) },
    {
      $set: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        specialization: profile.specialization,
        category: profile.category,
        experience: profile.experience,
        qualifications: profile.qualifications,
        consultationFee: profile.consultationFee,
        availability,
        status: "approved",
        updatedAt: now,
      },
      $setOnInsert: {
        _id:
          profile.email === "demo.doctor@arkcare.local"
            ? objectIdFor("arkcare-demo-doctor")
            : objectIdFor("arkcare-demo-doctor-profile:" + profile.key),
        userId: String(user._id),
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const doctor = await db
    .collection("doctors")
    .findOne({ userId: String(user._id) });

  return { user, doctor };
}

async function ensureUser(db, role, name) {
  const email = `demo.${role}@arkcare.local`;
  let user = await db.collection("users").findOne({ email });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const _id = objectIdFor("arkcare-demo-user:" + role);
    await db.collection("users").insertOne({
      _id,
      name,
      email,
      passwordHash,
      role,
      gender: "other",
      createdAt: now,
      updatedAt: now,
    });
    user = await db.collection("users").findOne({ _id });
  } else {
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { name, role, gender: user.gender || "other", updatedAt: now } }
    );
    user = await db.collection("users").findOne({ _id: user._id });
  }
  return user;
}

async function ensureOrganization(db, blueprint) {
  await db.collection("organizations").updateOne(
    { slug: blueprint.slug },
    {
      $set: {
        name: blueprint.name,
        demo: true,
        settings: blueprint.settings,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return db.collection("organizations").findOne({ slug: blueprint.slug });
}

async function ensureProgram(db, organization, blueprint) {
  await db.collection("hospitalprograms").updateOne(
    { organization: organization._id, slug: blueprint.slug },
    {
      $set: {
        organization: organization._id,
        ...blueprint,
        status: "active",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  return db
    .collection("hospitalprograms")
    .findOne({ organization: organization._id, slug: blueprint.slug });
}

async function appendDemoAudit(db, {
  organization,
  program,
  eventId,
  eventType,
  actorUserId,
  actorRole,
  resourceType,
  resourceId,
  metadata = {},
  verificationLevel = "system_confirmed",
}) {
  const existing = await db.collection("auditevents").findOne({ eventId });
  if (existing) return existing;

  const previous = await db
    .collection("auditevents")
    .find({ organization, schemaVersion: 2 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .next();

  const event = {
    _id: objectIdFor("audit:" + eventId),
    schemaVersion: 2,
    organization,
    program,
    eventId,
    eventType,
    actorUserId: String(actorUserId),
    actorRole,
    resourceType,
    resourceId: String(resourceId),
    verificationLevel,
    metadata,
    previousHash: previous?.eventHash || "",
    createdAt: new Date(),
  };

  const canonical = JSON.stringify(
    stable({
      schemaVersion: 2,
      organizationId: String(event.organization || ""),
      programId: String(event.program || ""),
      eventId: event.eventId,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      actorRole: event.actorRole,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      verificationLevel: event.verificationLevel,
      metadata: event.metadata,
      previousHash: event.previousHash,
    })
  );
  event.eventHash = digest(canonical);

  await db.collection("auditevents").insertOne(event);
  return event;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const users = {
    patient: await ensureUser(db, "patient", "Demo Patient"),
    doctor: await ensureUser(db, "doctor", "Dr. Aisha Rahman"),
    nurse: await ensureUser(db, "nurse", "Nurse Meera Singh"),
    coordinator: await ensureUser(db, "coordinator", "Care Coordinator Arjun"),
    hospital_admin: await ensureUser(db, "hospital_admin", "Hospital Admin"),
  };

  await db.collection("patients").updateOne(
    { userId: String(users.patient._id) },
    {
      $set: {
        name: "Demo Patient",
        email: users.patient.email,
        gender: "other",
        patientDescription: JSON.stringify(patientDescription),
        lab_json: JSON.stringify({
          parsed_json: medicalReports,
          pdf_download_url: null,
          processed_at: now.toISOString(),
          total_files_processed: 5,
          total_reports_merged: 5,
          unique_tests_found: 27,
          lab_summary: labSummary,
          synthetic_demo: true,
        }),
        updatedAt: now,
      },
      $setOnInsert: {
        _id: objectIdFor("arkcare-demo-patient"),
        userId: String(users.patient._id),
        createdAt: now,
      },
    },
    { upsert: true }
  );
  const patient = await db
    .collection("patients")
    .findOne({ userId: String(users.patient._id) });

  await db.collection("doctors").updateOne(
    { userId: String(users.doctor._id) },
    {
      $set: {
        name: "Dr. Aisha Rahman",
        email: users.doctor.email,
        phone: "+91 98000 00001",
        specialization: "Cardiology",
        category: "cardiology",
        experience: 12,
        qualifications: ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
        consultationFee: 1200,
        availability: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
          (day) => ({ day, slots: ["10:00", "11:00", "12:00", "16:00", "17:00"] })
        ),
        status: "approved",
        updatedAt: now,
      },
      $setOnInsert: {
        _id: objectIdFor("arkcare-demo-doctor"),
        userId: String(users.doctor._id),
        createdAt: now,
      },
    },
    { upsert: true }
  );
  const doctor = await db
    .collection("doctors")
    .findOne({ userId: String(users.doctor._id) });

  const cityOrg = await ensureOrganization(db, {
    name: "ArkCare City Hospital",
    slug: "arkcare-demo-hospital",
    settings: {
      defaultTimezone: "Asia/Kolkata",
      handoffDueMinutes: 240,
      simulatedCareBenefitPoolInr: 25000,
    },
  });
  const lotusOrg = await ensureOrganization(db, {
    name: "Lotus Heart Institute",
    slug: "lotus-heart-demo",
    settings: {
      defaultTimezone: "Asia/Kolkata",
      handoffDueMinutes: 180,
      simulatedCareBenefitPoolInr: 18000,
    },
  });

  const cityProgram = await ensureProgram(db, cityOrg, {
    slug: "carequest-city",
    name: "CareQuest City",
    capsuleName: "City Capsule",
    capsuleSymbol: "CITY",
    visualTheme: { accent: "sage", mascot: "guide" },
    rules: { dailyAwardCap: 12, activityGoalSteps: 5000, activityRewardCapsules: 3 },
    blockchain: { enabled: true, tokenId: "1001" },
  });
  const lotusProgram = await ensureProgram(db, lotusOrg, {
    slug: "lotus-path",
    name: "Lotus Path",
    capsuleName: "Lotus Capsule",
    capsuleSymbol: "LOTUS",
    visualTheme: { accent: "lavender", mascot: "walker" },
    rules: { dailyAwardCap: 10, activityGoalSteps: 3500, activityRewardCapsules: 2 },
    blockchain: { enabled: true, tokenId: "1002" },
  });

  const seededDoctors = [];
  for (const profile of DEMO_DOCTORS) {
    const seeded = await ensureSyntheticDoctor(db, profile);
    seededDoctors.push(seeded);

    await db.collection("carequestmemberships").updateOne(
      { user: seeded.user._id, organization: cityOrg._id },
      {
        $set: {
          role: "doctor",
          team: "CareQuest Demo Medical Staff",
          active: true,
          updatedAt: now,
        },
        $setOnInsert: {
          user: seeded.user._id,
          organization: cityOrg._id,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  for (const [org, program, fundedAmount] of [
    [cityOrg, cityProgram, 25000],
    [lotusOrg, lotusProgram, 18000],
  ]) {
    await db.collection("rewardbudgets").updateOne(
      { program: program._id },
      {
        $set: {
          organization: org._id,
          program: program._id,
          currency: "INR",
          fundedAmount,
          reservedAmount: 0,
          spentAmount: 0,
          status: "active",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const catalog = [
    [cityOrg, cityProgram, "Care learning pack", "Accessible patient education bundle for the current care journey.", "education", 8, 75],
    [cityOrg, cityProgram, "Travel support voucher", "Demo-funded support for a planned follow-up journey.", "travel", 50, 200],
    [lotusOrg, lotusProgram, "Accessible wellness guide", "Large-text and audio-friendly wellness education resources.", "accessibility", 15, 50],
    [lotusOrg, lotusProgram, "Follow-up access support", "Demo support attached to a clinically planned follow-up.", "follow_up_support", 40, 150],
  ];
  for (const [org, program, title, description, category, costCapsules, programCostInr] of catalog) {
    await db.collection("rewardcatalogitems").updateOne(
      { program: program._id, title },
      {
        $set: {
          organization: org._id,
          program: program._id,
          title,
          description,
          category,
          costCapsules,
          programCostInr,
          redeemedCount: 0,
          active: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  for (const [org, program] of [
    [cityOrg, cityProgram],
    [lotusOrg, lotusProgram],
  ]) {
    await db.collection("patientmemberships").updateOne(
      { patient: patient._id, organization: org._id, program: program._id },
      {
        $set: {
          status: "active",
          consents: {
            rewards: true,
            simulatedActivityData: false,
          },
          updatedAt: now,
        },
        $setOnInsert: {
          patient: patient._id,
          organization: org._id,
          program: program._id,
          joinedAt: ago(30),
          createdAt: ago(30),
        },
      },
      { upsert: true }
    );
  }

  for (const [role, user] of Object.entries(users)) {
    if (role === "patient") continue;
    await db.collection("carequestmemberships").updateOne(
      { user: user._id, organization: cityOrg._id },
      {
        $set: {
          role,
          team: "CareQuest Demo Team",
          active: true,
          updatedAt: now,
        },
        $setOnInsert: {
          user: user._id,
          organization: cityOrg._id,
          createdAt: ago(30),
        },
      },
      { upsert: true }
    );
  }

  await db.collection("userpreferences").updateOne(
    { userId: String(users.patient._id) },
    {
      $set: {
        careQuestOptIn: true,
        paused: false,
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        accessibility: {
          reducedMotion: false,
          largerText: false,
          audioSupport: false,
        },
        quietHours: {
          enabled: true,
          start: "22:00",
          end: "07:00",
        },
        revealSensitiveLockScreenText: false,
        celebrationEnabled: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(30) },
    },
    { upsert: true }
  );

  const consultationId = objectIdFor("carequest-showcase:consultation");
  const followupId = objectIdFor("carequest-showcase:followup");

  await db.collection("appointments").updateOne(
    { _id: consultationId },
    {
      $set: {
        organization: cityOrg._id,
        program: cityProgram._id,
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: ago(7),
        reason: "SYNTHETIC DEMO - cardiometabolic risk review",
        status: "completed",
        notes:
          "Synthetic consultation used to demonstrate clinician-approved CareQuest continuity.",
        slotKey: "carequest-showcase:consultation",
        amount: 0,
        currency: "INR",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(7) },
    },
    { upsert: true }
  );

  await db.collection("appointments").updateOne(
    { _id: followupId },
    {
      $set: {
        organization: cityOrg._id,
        program: cityProgram._id,
        patient: patient._id,
        doctor: doctor._id,
        appointmentDate: ahead(7),
        reason: "SYNTHETIC DEMO - clinician-planned CareQuest follow-up",
        status: "confirmed",
        notes: "Synthetic follow-up booking. No real payment or medical claim.",
        slotKey: "carequest-showcase:followup",
        amount: 0,
        currency: "INR",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(1) },
    },
    { upsert: true }
  );

  for (const appointmentId of [consultationId, followupId]) {
    await db.collection("paymentevidences").updateOne(
      { appointment: appointmentId },
      {
        $set: {
          organization: cityOrg._id,
          program: cityProgram._id,
          appointment: appointmentId,
          provider: "demo",
          providerPaymentId: null,
          providerOrderId: null,
          currency: "INR",
          grossAmount: 0,
          refundAmount: 0,
          netPaidAmount: 0,
          status: "demo",
          capturedAt: now,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const carePlanId = objectIdFor("carequest-showcase:plan");
  const versionId = objectIdFor("carequest-showcase:plan:v1");
  await db.collection("careplans").updateOne(
    { _id: carePlanId },
    {
      $set: {
        organization: cityOrg._id,
        program: cityProgram._id,
        patient: patient._id,
        ownerDoctor: doctor._id,
        sourceAppointment: consultationId,
        status: "active",
        currentVersion: 1,
        currentApprovedVersion: 1,
        createdByUserId: String(users.doctor._id),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(7) },
    },
    { upsert: true }
  );

  const activities = [
    {
      activityKey: "demo-understand-plan",
      type: "lesson",
      title: "Understand your approved care plan",
      instructions:
        "Review the clinician-approved plan and confirm that you understand the next steps.",
      recurrence: { kind: "once", timeLocal: "09:00", daysOfWeek: [], interval: 1 },
      safetyText: "Educational task only; it does not change treatment.",
      helpText: "Use Need Help if the plan is unclear.",
      activityConfig: { goalType: "steps", goalValue: 5000 },
    },
    {
      activityKey: "demo-daily-checkin",
      type: "reminder",
      title: "Daily care check-in",
      instructions:
        "Respond honestly with Done, Not Done, or Need Help. All honest responses receive equal participation credit.",
      recurrence: { kind: "daily", timeLocal: "09:00", daysOfWeek: [], interval: 1 },
      safetyText: "This is not a medical emergency monitor.",
      helpText: "Use Need Help to create a staff handoff.",
      activityConfig: { goalType: "steps", goalValue: 5000 },
    },
    {
      activityKey: "demo-approved-walk",
      type: "activity",
      title: "Clinician-approved walking activity",
      instructions:
        "Complete the synthetic 5,000-step demo mission only if appropriate. The phone/wearable stream is simulated.",
      recurrence: { kind: "once", timeLocal: "09:00", daysOfWeek: [], interval: 1 },
      safetyText: "Synthetic activity demo; not a universal target.",
      helpText: "Use Need Help if you need an accessible alternative.",
      activityConfig: { goalType: "steps", goalValue: 5000 },
    },
    {
      activityKey: "demo-followup",
      type: "follow_up",
      title: "Attend planned follow-up",
      instructions:
        "Attend the clinician-planned synthetic follow-up appointment.",
      recurrence: { kind: "once", timeLocal: "11:00", daysOfWeek: [], interval: 1 },
      safetyText: "Only planned care is rewarded; do not seek extra visits for Capsules.",
      helpText: "Contact the care team if scheduling becomes difficult.",
      activityConfig: { goalType: "steps", goalValue: 5000 },
    },
  ];

  await db.collection("planversions").updateOne(
    { _id: versionId },
    {
      $set: {
        carePlan: carePlanId,
        versionNumber: 1,
        status: "approved",
        title: "Synthetic cardiology continuity plan",
        summary:
          "Demo-only plan linking report review, patient education, honest check-ins, a simulated activity mission and a planned follow-up.",
        validFrom: ago(7),
        validTo: null,
        timezone: "Asia/Kolkata",
        safetyText:
          "SYNTHETIC DEMO ONLY. This plan is not medical advice and contains no real prescription.",
        helpText:
          "Use Need Help for workflow testing; urgent real-world concerns require appropriate emergency services.",
        activities,
        source: {
          type: "document_summary",
          reference: "SYNTHETIC-DEMO-PDF-PACK",
        },
        createdByUserId: String(users.doctor._id),
        approvedByUserId: String(users.doctor._id),
        approvedAt: ago(7),
        rejectedByUserId: null,
        rejectedAt: null,
        rejectionReason: "",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(7) },
    },
    { upsert: true }
  );

  const occurrenceIds = {
    lesson: objectIdFor("carequest-showcase:occurrence:lesson"),
    reminder: objectIdFor("carequest-showcase:occurrence:reminder"),
    activity: objectIdFor("carequest-showcase:occurrence:activity"),
    followup: objectIdFor("carequest-showcase:occurrence:followup"),
  };

  const occurrenceRows = [
    {
      _id: occurrenceIds.lesson,
      occurrenceKey: "carequest-showcase:lesson:v1",
      activityKey: "demo-understand-plan",
      activityType: "lesson",
      title: "Understand your approved care plan",
      instructions: activities[0].instructions,
      scheduledFor: ago(6),
      originalScheduledFor: ago(6),
      status: "completed",
      currentResponse: "done",
      deliveryStatus: "sent",
      linkedAppointment: null,
      safetyText: activities[0].safetyText,
      helpText: activities[0].helpText,
      activityConfig: activities[0].activityConfig,
    },
    {
      _id: occurrenceIds.reminder,
      occurrenceKey: "carequest-showcase:reminder:v1",
      activityKey: "demo-daily-checkin",
      activityType: "reminder",
      title: "Daily care check-in",
      instructions: activities[1].instructions,
      scheduledFor: ago(2),
      originalScheduledFor: ago(2),
      status: "responded",
      currentResponse: "need_help",
      deliveryStatus: "sent",
      linkedAppointment: null,
      safetyText: activities[1].safetyText,
      helpText: activities[1].helpText,
      activityConfig: activities[1].activityConfig,
    },
    {
      _id: occurrenceIds.activity,
      occurrenceKey: "carequest-showcase:activity:v1",
      activityKey: "demo-approved-walk",
      activityType: "activity",
      title: "Clinician-approved walking activity",
      instructions: activities[2].instructions,
      scheduledFor: new Date(now.getTime() - 5 * 60 * 1000),
      originalScheduledFor: new Date(now.getTime() - 5 * 60 * 1000),
      status: "due",
      currentResponse: null,
      deliveryStatus: "sent",
      linkedAppointment: null,
      safetyText: activities[2].safetyText,
      helpText: activities[2].helpText,
      activityConfig: activities[2].activityConfig,
    },
    {
      _id: occurrenceIds.followup,
      occurrenceKey: "carequest-showcase:followup:v1",
      activityKey: "demo-followup",
      activityType: "follow_up",
      title: "Attend planned follow-up",
      instructions: activities[3].instructions,
      scheduledFor: ahead(7),
      originalScheduledFor: ahead(7),
      status: "scheduled",
      currentResponse: null,
      deliveryStatus: "pending",
      linkedAppointment: followupId,
      safetyText: activities[3].safetyText,
      helpText: activities[3].helpText,
      activityConfig: activities[3].activityConfig,
    },
  ];

  for (const row of occurrenceRows) {
    await db.collection("scheduledoccurrences").updateOne(
      { _id: row._id },
      {
        $set: {
          ...row,
          organization: cityOrg._id,
          program: cityProgram._id,
          carePlan: carePlanId,
          planVersion: versionId,
          patient: patient._id,
          ownerDoctor: doctor._id,
          timezone: "Asia/Kolkata",
          snoozeCount: 0,
          qstashMessageId: null,
          cancelledAt: null,
          cancelReason: "",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: row.originalScheduledFor },
      },
      { upsert: true }
    );
  }

  await db.collection("patientresponses").updateOne(
    { responseKey: "carequest-showcase:lesson-response" },
    {
      $set: {
        occurrence: occurrenceIds.lesson,
        patient: patient._id,
        response: "lesson_completed",
        note: "Synthetic lesson completion",
        verificationLevel: "system_confirmed",
        reportedAt: ago(6),
        snoozedUntil: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(6) },
    },
    { upsert: true }
  );

  await db.collection("patientresponses").updateOne(
    { responseKey: "carequest-showcase:need-help-response" },
    {
      $set: {
        occurrence: occurrenceIds.reminder,
        patient: patient._id,
        response: "need_help",
        note: "Synthetic patient requested clarification about the care plan.",
        verificationLevel: "self_report",
        reportedAt: ago(2),
        snoozedUntil: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(2) },
    },
    { upsert: true }
  );

  for (const [key, occurrence, sentAt] of [
    ["carequest-showcase:delivery:lesson", occurrenceIds.lesson, ago(6)],
    ["carequest-showcase:delivery:reminder", occurrenceIds.reminder, ago(2)],
    ["carequest-showcase:delivery:activity", occurrenceIds.activity, ago(0, 1)],
  ]) {
    await db.collection("reminderdeliveries").updateOne(
      { deliveryKey: key },
      {
        $set: {
          occurrence,
          patient: patient._id,
          channel: "in_app",
          status: "sent",
          attempts: 1,
          providerMessageId: null,
          failureCode: "",
          sentAt,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: sentAt },
      },
      { upsert: true }
    );
  }

  const handoffId = objectIdFor("carequest-showcase:handoff");
  await db.collection("handoffcases").updateOne(
    { _id: handoffId },
    {
      $set: {
        dedupeKey: "carequest-showcase:handoff:need-help",
        organization: cityOrg._id,
        patient: patient._id,
        carePlan: carePlanId,
        planVersion: versionId,
        occurrence: occurrenceIds.reminder,
        priority: "normal",
        assignedRole: "coordinator",
        assignedTo: null,
        team: "CareQuest Demo Team",
        dueAt: ahead(0, 2),
        summary:
          "Synthetic Need Help request: patient wants clarification about the approved care plan.",
        status: "open",
        lastContactSuccessful: null,
        outcome: "",
        resolvedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(2) },
    },
    { upsert: true }
  );

  await db.collection("caseevents").updateOne(
    { _id: objectIdFor("carequest-showcase:case-event:created") },
    {
      $set: {
        caseId: handoffId,
        eventType: "case.created",
        actorUserId: String(users.patient._id),
        actorRole: "patient",
        note: "Synthetic Need Help request created this case.",
        metadata: { source: "seed:demo" },
        createdAt: ago(2),
      },
    },
    { upsert: true }
  );

  const awards = [
    {
      label: "lesson",
      ruleId: "lesson_completed",
      sourceType: "ScheduledOccurrence",
      sourceId: String(occurrenceIds.lesson),
      amount: 2,
      verificationLevel: "system_confirmed",
      createdAt: ago(6),
    },
    {
      label: "response",
      ruleId: "scheduled_response",
      sourceType: "ScheduledOccurrence",
      sourceId: String(occurrenceIds.reminder),
      amount: 1,
      verificationLevel: "self_report",
      createdAt: ago(2),
    },
    {
      label: "followup-booked",
      ruleId: "follow_up_booked",
      sourceType: "Appointment",
      sourceId: String(followupId),
      amount: 2,
      verificationLevel: "system_confirmed",
      createdAt: ago(1),
    },
  ];

  for (const award of awards) {
    await db.collection("capsuleawards").updateOne(
      { idempotencyKey: "carequest-showcase:" + award.label },
      {
        $set: {
          patient: patient._id,
          organization: cityOrg._id,
          program: cityProgram._id,
          ruleId: award.ruleId,
          ruleVersion: 1,
          sourceType: award.sourceType,
          sourceId: award.sourceId,
          amount: award.amount,
          verificationLevel: award.verificationLevel,
          idempotencyKey: "carequest-showcase:" + award.label,
          eventType: "award",
          reversalOf: null,
          blockchain: {
            status:
              process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true"
                ? "pending"
                : "disabled",
            txHash: null,
            syncedAt: null,
          },
          createdAt: award.createdAt,
        },
      },
      { upsert: true }
    );
  }

  await db.collection("capsulebalanceprojections").updateOne(
    {
      patient: patient._id,
      organization: cityOrg._id,
      program: cityProgram._id,
    },
    {
      $set: {
        balance: 5,
        lifetimeEarned: 5,
        lifetimeRedeemed: 0,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: ago(6) },
    },
    { upsert: true }
  );

  await db.collection("capsulebalanceprojections").updateOne(
    {
      patient: patient._id,
      organization: lotusOrg._id,
      program: lotusProgram._id,
    },
    {
      $set: {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await db.collection("capsuledailycounters").updateOne(
    {
      patient: patient._id,
      organization: cityOrg._id,
      program: cityProgram._id,
      dayKey: hospitalDayKey(),
    },
    {
      $set: { awarded: 5, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await db.collection("workflowfeedbacks").updateOne(
    { _id: objectIdFor("carequest-showcase:workflow-feedback") },
    {
      $set: {
        organization: cityOrg._id,
        staffUser: users.nurse._id,
        staffRole: "nurse",
        duplicateEntryMinutes: 8,
        alertBurden: 2,
        note:
          "Synthetic baseline: CareQuest reduced repeated manual follow-up in the demo workflow.",
        createdAt: ago(1),
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  await appendDemoAudit(db, {
    organization: cityOrg._id,
    program: cityProgram._id,
    eventId: "demo-seed:medical-records:v1",
    eventType: "demo.medical_records.seeded",
    actorUserId: users.hospital_admin._id,
    actorRole: "hospital_admin",
    resourceType: "Patient",
    resourceId: patient._id,
    metadata: { synthetic: true, reportCount: medicalReports.length },
  });

  await appendDemoAudit(db, {
    organization: cityOrg._id,
    program: cityProgram._id,
    eventId: "demo-seed:care-plan:v1",
    eventType: "demo.care_plan.seeded",
    actorUserId: users.doctor._id,
    actorRole: "doctor",
    resourceType: "CarePlan",
    resourceId: carePlanId,
    metadata: { synthetic: true, approvedVersion: 1 },
    verificationLevel: "clinician_approved",
  });

  await appendDemoAudit(db, {
    organization: cityOrg._id,
    program: cityProgram._id,
    eventId: "demo-seed:handoff:v1",
    eventType: "demo.handoff.seeded",
    actorUserId: users.patient._id,
    actorRole: "patient",
    resourceType: "HandoffCase",
    resourceId: handoffId,
    metadata: { synthetic: true, status: "open" },
    verificationLevel: "self_report",
  });

  console.log("");
  console.log("ArkCare synthetic demo seed complete");
  console.log("-----------------------------------");
  console.log("Patient: demo.patient@arkcare.local");
  console.log("Doctor:  demo.doctor@arkcare.local");
  console.log("Nurse:   demo.nurse@arkcare.local");
  console.log("Admin:   demo.hospital_admin@arkcare.local");
  console.log("Primary program: CareQuest City / CITY");
  console.log("Secondary program: Lotus Path / LOTUS");
  console.log("Seeded CITY balance: 5");
  console.log("Seeded medical reports: 5");
  console.log("Seeded approved doctors: " + DEMO_DOCTORS.length);
  console.log(
    "Doctor specialties: " +
      [...new Set(DEMO_DOCTORS.map((item) => item.category))].join(", ")
  );
  console.log("Open synthetic handoff: 1");
  console.log("");
  console.log("All seeded clinical/financial content is synthetic demo data.");
}

try {
  await seed();
} finally {
  await mongoose.disconnect();
}
