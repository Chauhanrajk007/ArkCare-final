"use server";

import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { createSession } from "@/lib/auth";

/**
 * HACKATHON_DEMO_ACCESS
 * --------------------
 * Lets a reviewer one-click into any seeded hospital-admin or doctor demo
 * account from the network directory. It is intentionally restricted to the
 * synthetic demo accounts (the fixed *.local emails the seeds create) and is
 * gated by the same kill-switch as demoAuthActions.
 *
 * HACKATHON_DEMO_REMOVE_AFTER_JUDGING: delete this file and its button in
 * NetworkAccounts.jsx.
 */

const HACKATHON_DEMO_MODE = true;

// Only these synthetic, locally-seeded demo emails may be entered this way.
const DEMO_EMAIL_SUFFIXES = ["@arkcare.local", "@sunrise-care-hospital.local", "@lotus-heart-demo.local", "@metro-health-clinic.local", "@arkcare-demo-hospital.local"];

export async function instantEnterAs(email) {
  if (!HACKATHON_DEMO_MODE) throw new Error("Demo entry is disabled.");
  const normalized = String(email || "").trim().toLowerCase();
  if (!DEMO_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    throw new Error("This account is not a demo account.");
  }

  await connectDB();
  const user = await User.findOne({ email: normalized });
  if (!user) throw new Error("Demo account not found.");
  if (!["doctor", "hospital_admin", "platform_admin"].includes(user.role)) {
    throw new Error("Only doctor, hospital admin, and platform accounts are listed here.");
  }

  await createSession(user);
  return { success: true, role: user.role };
}
