"use server";

import { requireUser } from "@/lib/auth";
import {
  getHospitalDirectory,
  getHospitalProfile,
  getPlatformOverview,
} from "@/lib/carequest/hospitals";
import { requireStaffMembership, isPlatformAdmin } from "@/lib/carequest/permissions";

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Public directory of every hospital with its reputation (capsules earned by
 * its patients — a non-cash, non-transferable engagement metric) and its own
 * on-chain audit head. Available to any signed-in user.
 */
export async function getHospitalsDirectory() {
  const user = await requireUser();
  void user;
  return serialize(await getHospitalDirectory());
}

/**
 * A hospital admin's own hospital profile + per-patient reputation leaderboard.
 * Scoped to the admin's home organization for tenant isolation.
 */
export async function getMyHospitalProfile() {
  const user = await requireUser();
  if (user.role !== "hospital_admin" && !isPlatformAdmin(user)) {
    throw new Error("Hospital admin access required");
  }

  if (isPlatformAdmin(user)) {
    // The platform admin picks a hospital to inspect; default to the first.
    const directory = await getHospitalDirectory();
    if (!directory.length) return null;
    return serialize(await getHospitalProfile(directory[0].organizationId));
  }

  const membership = await requireStaffMembership(user, ["hospital_admin"]);
  if (!membership.organization) {
    throw new Error("No hospital assigned to this admin");
  }
  return serialize(
    await getHospitalProfile(membership.organization._id)
  );
}

/**
 * The platform (master) console: every hospital, its audit head, and the
 * network-wide activity. Restricted to platform admins.
 */
export async function getPlatformConsole() {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) {
    throw new Error("Platform admin access required");
  }
  return serialize(await getPlatformOverview());
}
