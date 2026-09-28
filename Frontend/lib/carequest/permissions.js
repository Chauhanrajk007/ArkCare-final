import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import CareQuestMembership from "@/models/CareQuestMembership";

/**
 * Tenancy model
 * --------------
 * - `platform_admin` (the master/super view) is NOT scoped to one hospital; it
 *   can read every organization and each hospital's own audit head.
 * - `hospital_admin` / `nurse` / `coordinator` / `doctor` staff are scoped to the
 *   hospital in `user.homeOrganization`, so their data and audit chain are
 *   isolated per hospital.
 * - `patient` users are not staff and are not scoped to a single hospital; they
 *   can belong to several hospital programs (the "capsule arsenal").
 *
 * For backward compatibility, staff with no `homeOrganization` fall back to the
 * original demo hospital, so the pre-existing demo accounts keep working.
 */

export async function getOrCreateDemoOrganization() {
  await connectDB();
  return Organization.findOneAndUpdate(
    { slug: "arkcare-demo-hospital" },
    {
      $setOnInsert: {
        name: "ArkCare Demo Hospital",
        slug: "arkcare-demo-hospital",
        demo: true,
        settings: {
          defaultTimezone: "Asia/Kolkata",
          handoffDueMinutes: 240,
          simulatedCareBenefitPoolInr: 25000,
        },
      },
    },
    { upsert: true, new: true }
  );
}

export function isPlatformAdmin(user) {
  return user?.role === "platform_admin";
}

const STAFF_ROLES = new Set([
  "doctor",
  "nurse",
  "coordinator",
  "hospital_admin",
]);

/**
 * Resolve which organization a staff member belongs to. Returns null for the
 * platform admin (who is intentionally not scoped to a single hospital).
 */
export async function resolveStaffOrganization(user) {
  await connectDB();

  if (isPlatformAdmin(user)) return null;

  if (user?.homeOrganization) {
    const org = await Organization.findById(user.homeOrganization);
    if (org) return org;
  }

  // Backward-compatible fallback: unassigned staff belong to the demo hospital.
  return getOrCreateDemoOrganization();
}

export async function ensureCareQuestMembership(user, role = user.role) {
  if (!STAFF_ROLES.has(role)) return null;

  const organization = await resolveStaffOrganization(user);
  if (!organization) return null;

  return CareQuestMembership.findOneAndUpdate(
    { user: user._id, organization: organization._id },
    {
      $set: {
        role,
        active: true,
        team: organization.name,
      },
    },
    { upsert: true, new: true }
  ).populate("organization");
}

export async function requireStaffMembership(
  user,
  allowedRoles = ["nurse", "coordinator", "hospital_admin"]
) {
  // The platform admin may inspect any hospital's operations view.
  if (isPlatformAdmin(user)) {
    const organization = await resolveStaffOrganization(user);
    return { user: user._id, organization, role: "platform_admin", active: true, isPlatform: true };
  }

  if (!allowedRoles.includes(user.role)) {
    throw new Error("CareQuest staff access required");
  }

  const membership = await ensureCareQuestMembership(user, user.role);
  if (!membership?.active) throw new Error("Inactive CareQuest membership");
  return membership;
}
