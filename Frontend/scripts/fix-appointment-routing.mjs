/**
 * Backfill: re-stamp existing appointments (and their PaymentEvidence) to the
 * DOCTOR's hospital instead of the patient's primary hospital.
 *
 * Before the routing fix, a booking was stamped with the patient's primary
 * program, so a booking with a doctor from another hospital was hidden from
 * that doctor (their dashboard filters by their own hospital). This migration
 * moves each appointment onto its doctor's assigned hospital so every doctor
 * sees their own bookings and each hospital sees its own doctors' patients.
 *
 * Safe to re-run. Run: npm run seed:fix-routing
 */
import mongoose from "mongoose";
import { MongoClient } from "mongodb";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/arkcare";

/** Resolve the hospital (org + program) a doctor belongs to, mirroring
 *  getProgramContextForDoctor: homeOrganization -> membership -> demo org. */
async function resolveDoctorOrg(db, doctor) {
  const orgs = await db.collection("organizations").find({}).toArray();
  const programs = await db
    .collection("hospitalprograms")
    .find({ status: "active" })
    .toArray();
  const programFor = (orgId) =>
    programs.find((p) => String(p.organization) === String(orgId));

  const user = await db
    .collection("users")
    .findOne({ _id: new mongoose.Types.ObjectId(doctor.userId) });

  if (user?.homeOrganization) {
    const org = orgs.find((o) => String(o._id) === String(user.homeOrganization));
    const program = programFor(user.homeOrganization);
    if (org && program) return { organization: org, program };
  }

  const membership = await db
    .collection("carequestmemberships")
    .findOne({ user: doctor.userId, role: "doctor", active: true });
  if (membership?.organization) {
    const org = orgs.find((o) => String(o._id) === String(membership.organization));
    const program = programFor(membership.organization);
    if (org && program) return { organization: org, program };
  }

  const demoOrg = orgs.find((o) => o.slug === "arkcare-demo-hospital") || orgs[0];
  return { organization: demoOrg, program: programFor(demoOrg._id) };
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const appointments = await db.collection("appointments").find({}).toArray();

  let moved = 0;
  for (const appointment of appointments) {
    const doctor = await db
      .collection("doctors")
      .findOne({ _id: appointment.doctor });
    if (!doctor) continue;

    const { organization, program } = await resolveDoctorOrg(db, doctor);
    if (!organization || !program) continue;

    const currentOrgId = appointment.organization
      ? String(appointment.organization)
      : null;
    if (currentOrgId === String(organization._id)) continue;

    await db
      .collection("appointments")
      .updateOne(
        { _id: appointment._id },
        { $set: { organization: organization._id, program: program._id } }
      );
    await db
      .collection("paymentevidences")
      .updateMany(
        { appointment: appointment._id },
        { $set: { organization: organization._id, program: program._id } }
      );
    moved += 1;
    console.log(
      `  moved "${appointment.reason || "(no reason)"}" -> ${organization.name}`
    );
  }

  console.log(`Re-routed ${moved} appointment(s) to their doctor's hospital.`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
