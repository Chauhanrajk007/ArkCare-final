"use server";

import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import HospitalProgram from "@/models/HospitalProgram";
import Doctor from "@/models/Doctor";
import User from "@/models/User";
import CareQuestMembership from "@/models/CareQuestMembership";

/**
 * A demo directory of every hospital and doctor account in the network, with the
 * credential + landing route for each, so a reviewer can one-click into any
 * dashboard. Read-only listing; the actual sign-in still goes through the normal
 * session (or the instant demo sign-in).
 */
export async function getNetworkAccounts() {
  await requireUser();
  await connectDB();

  const [organizations, programs, doctors] = await Promise.all([
    Organization.find({}).sort({ name: 1 }).lean(),
    HospitalProgram.find({ status: "active" }).lean(),
    Doctor.find({ status: "approved" }).lean(),
  ]);

  // Map each hospital -> its admins and doctors
  const memberships = await CareQuestMembership.find({ active: true }).lean();
  const programByOrg = new Map(
    programs.map((p) => [String(p.organization), p])
  );
  const orgById = new Map(organizations.map((o) => [String(o._id), o]));
  const demoOrg =
    organizations.find((o) => o.slug === "arkcare-demo-hospital") || organizations[0];

  // Build doctors with their hospital. Prefer an explicit CareQuestMembership,
  // then homeOrganization, then fall back to the demo hospital so every
  // approved doctor is enterable from the directory.
  const doctorRows = [];
  for (const doctor of doctors) {
    const membership = memberships.find(
      (m) =>
        m.role === "doctor" &&
        String(m.user) === String(doctor.userId) &&
        programByOrg.has(String(m.organization))
    );
    const doctorUser = await User.findOne({
      _id: new (await import("mongoose")).Types.ObjectId(String(doctor.userId)),
    }).lean();
    const organization = membership
      ? orgById.get(String(membership.organization))
      : doctorUser?.homeOrganization
        ? orgById.get(String(doctorUser.homeOrganization))
        : demoOrg;
    doctorRows.push({
      _id: String(doctor._id),
      name: doctor.name,
      email: doctor.email,
      specialization: doctor.specialization,
      category: doctor.category,
      experience: Number(doctor.experience || 0),
      hospitalName: organization?.name || "Unassigned",
      hospitalSlug: organization?.slug || "",
    });
  }
  doctorRows.sort(
    (a, b) => a.hospitalName.localeCompare(b.hospitalName) || a.name.localeCompare(b.name)
  );

  // Hospital admins
  const hospitalRows = [];
  for (const organization of organizations) {
    const adminMemberships = memberships.filter(
      (m) => m.role === "hospital_admin" && String(m.organization) === String(organization._id)
    );
    const program = programByOrg.get(String(organization._id));
    hospitalRows.push({
      _id: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      symbol: program?.capsuleSymbol || "CAP",
      adminEmail: adminMemberships[0]
        ? (await User.findById(adminMemberships[0].user).lean())?.email
        : null,
    });
  }

  const platformAdmin = await User.findOne({ role: "platform_admin" }).lean();

  return JSON.parse(
    JSON.stringify({
      hospitals: hospitalRows.filter((h) => h.adminEmail),
      doctors: doctorRows,
      platformAdminEmail: platformAdmin?.email || null,
      demoPassword: "DemoOnly!123",
    })
  );
}
