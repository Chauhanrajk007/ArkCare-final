/**
 * Multi-hospital network seed.
 *
 * Creates a platform (master) admin, per-hospital hospital admins, and assigns
 * the existing demo doctors across the hospital network by setting each
 * doctor's `homeOrganization` + a CareQuestMembership in that hospital. It also
 * enrolls the demo patient in every hospital program and seeds a little capsule
 * activity per hospital so the reputation dashboards are not empty.
 *
 * Safe to re-run: it upserts by deterministic id / email.
 *
 * Run:  npm run seed:hospitals
 */
import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import { createHash } from "node:crypto";

const DEMO_PASSWORD = "DemoOnly!123";
const now = new Date();

function loadEnv() {
  const path = ".env.local";
  if (!fs.existsSync(path)) return;
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
loadEnv();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/arkcare";

// Deterministic ObjectId from a string, so re-runs are stable.
function objectIdFor(key) {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return new mongoose.Types.ObjectId(hash);
}

async function ensureUser(db, { key, email, name, role, homeOrganization }) {
  let user = await db.collection("users").findOne({ email });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const _id = objectIdFor("hospitalnet:user:" + key);
    await db.collection("users").insertOne({
      _id,
      name,
      email,
      passwordHash,
      role,
      gender: "other",
      homeOrganization: homeOrganization || null,
      createdAt: now,
      updatedAt: now,
    });
    user = await db.collection("users").findOne({ _id });
  } else {
    await db
      .collection("users")
      .updateOne(
        { _id: user._id },
        { $set: { name, role, homeOrganization: homeOrganization || null, updatedAt: now } }
      );
    user = await db.collection("users").findOne({ _id: user._id });
  }
  return user;
}

async function ensureMembership(db, user, organization, role) {
  await db.collection("carequestmemberships").updateOne(
    { user: user._id, organization: organization._id },
    {
      $set: { role, active: true, team: organization.name, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

// Deterministic capsule awards per hospital so reputation tiers differ.
async function seedCapsuleActivity(db, { program, patient, organization, count, seedKey }) {
  const rules = [
    "scheduled_response",
    "lesson_completed",
    "activity_goal",
    "follow_up_attended",
  ];
  for (let i = 0; i < count; i += 1) {
    const ruleId = rules[i % rules.length];
    const sourceId = `hospitalnet:${seedKey}:${i}`;
    await db.collection("capsuleawards").updateOne(
      { idempotencyKey: `hospitalnet:${sourceId}` },
      {
        $setOnInsert: {
          _id: objectIdFor("hospitalnet:award:" + sourceId),
          patient: patient._id,
          organization: organization._id,
          program: program._id,
          ruleId,
          ruleVersion: 2,
          sourceType: "SeedActivity",
          sourceId,
          amount: 2,
          verificationLevel: "system_confirmed",
          eventType: "award",
          blockchain: { status: "disabled" },
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const organizations = await db
    .collection("organizations")
    .find({})
    .sort({ name: 1 })
    .toArray();
  const programs = await db.collection("hospitalprograms").find({}).toArray();

  const demoPatient = await db
    .collection("users")
    .findOne({ email: "demo.patient@arkcare.local" });
  const patientProfile = demoPatient
    ? await db.collection("patients").findOne({ userId: String(demoPatient._id) })
    : null;

  // A platform (master) admin that can see every hospital.
  await ensureUser(db, {
    key: "platform",
    email: "demo.platform_admin@arkcare.local",
    name: "Platform Admin",
    role: "platform_admin",
  });
  console.log("Platform: demo.platform_admin@arkcare.local");

  // Distribute a few doctors per hospital so each has a portfolio.
  const doctors = await db.collection("doctors").find({}).toArray();
  const assignments = [
    { slug: "arkcare-demo-hospital", emails: ["demo.doctor@arkcare.local", "demo.doctor.general@arkcare.local"] },
    { slug: "lotus-heart-demo", emails: ["demo.doctor.cardiology2@arkcare.local", "demo.doctor.endocrinology@arkcare.local"] },
    { slug: "sunrise-care-hospital", emails: ["demo.doctor.pediatrics@arkcare.local", "demo.doctor.dermatology@arkcare.local"] },
    { slug: "metro-health-clinic", emails: ["demo.doctor.neurology@arkcare.local", "demo.doctor.orthopedics@arkcare.local"] },
  ];

  for (const assignment of assignments) {
    const organization = organizations.find((o) => o.slug === assignment.slug);
    if (!organization) {
      console.warn("  ! missing organization", assignment.slug);
      continue;
    }
    const program = programs.find((p) => String(p.organization) === String(organization._id));

    // Hospital admin for this hospital.
    const admin = await ensureUser(db, {
      key: "admin:" + assignment.slug,
      email: "admin@" + assignment.slug + ".local",
      name: "Admin · " + organization.name,
      role: "hospital_admin",
      homeOrganization: organization._id,
    });
    await ensureMembership(db, admin, organization, "hospital_admin");

    // Assign the named doctors to this hospital.
    for (const email of assignment.emails) {
      const doctor = doctors.find((d) => d.email === email);
      if (!doctor) {
        console.warn("  ! missing doctor", email);
        continue;
      }
      await db
        .collection("users")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(doctor.userId) },
          { $set: { homeOrganization: organization._id, updatedAt: now } }
        );
      const doctorUser = await db
        .collection("users")
        .findOne({ _id: new mongoose.Types.ObjectId(doctor.userId) });
      await ensureMembership(db, doctorUser, organization, "doctor");
    }

    // Enroll the demo patient in this hospital's program + seed some activity.
    if (program && patientProfile) {
      await db.collection("patientmemberships").updateOne(
        { patient: patientProfile._id, program: program._id, organization: organization._id },
        {
          $set: { status: "active", joinedAt: now, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
      // vary the activity volume so reputation tiers are visibly different
      const perHospital = {
        "arkcare-demo-hospital": 40,
        "lotus-heart-demo": 25,
        "sunrise-care-hospital": 12,
        "metro-health-clinic": 6,
      }[assignment.slug] || 5;
      await seedCapsuleActivity(db, {
        program,
        patient: patientProfile,
        organization,
        count: perHospital,
        seedKey: assignment.slug,
      });
    }

    console.log(
      `  ${organization.name}: admin=${admin.email} doctors=${assignment.emails.length}`
    );
  }

  console.log("Hospital network seeded.");
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
