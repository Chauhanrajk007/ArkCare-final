"use server";

import connectDB from "@/lib/db";
import User from "@/models/User";
import Patient from "@/models/Patient";
import Doctor from "@/models/Doctor";
import { createSession, getSessionUser } from "@/lib/auth";

const VALID_ROLES = ["patient", "doctor"];

/**
 * Records the role the user picked on the landing page and provisions the
 * matching profile. Replaces the old Clerk `publicMetadata` write.
 */
export async function setUserRole(role) {
  try {
    if (!VALID_ROLES.includes(role)) {
      throw new Error("Invalid role");
    }

    const user = await getSessionUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    user.role = role;
    await user.save();

    // Re-issue the session so the role baked into the cookie stays in sync with
    // the database — middleware and socket.io read it from there. This has to
    // happen before the early return below, otherwise a brand-new doctor would
    // be stuck in a redirect loop.
    await createSession(user);

    await connectDB();

    const userId = user._id.toString();

    if (role === "patient") {
      // Create patient profile if it doesn't exist
      const existingPatient = await Patient.findOne({ userId });

      if (!existingPatient) {
        await Patient.create({
          userId,
          name: user.name,
          email: user.email,
          gender: user.gender || "other",
        });
      }
    } else if (role === "doctor") {
      // Check if doctor profile exists
      const existingDoctor = await Doctor.findOne({ userId });

      if (!existingDoctor) {
        // Don't redirect here, return a flag instead
        return { needsOnboarding: true, success: true, role };
      }
    }

    return { success: true, role };
  } catch (error) {
    console.error("Error setting user role:", error);
    throw error;
  }
}

/** The signed-in user's own record — used by profile screens. */
export async function getCurrentUser() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  return JSON.parse(JSON.stringify(user.toPublic()));
}

/** Update the signed-in user's editable profile fields. */
export async function updateProfile({ name, gender }) {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new Error("Name cannot be empty");
    user.name = trimmed;
  }

  if (gender !== undefined) {
    if (!["male", "female", "other"].includes(gender)) {
      throw new Error("Invalid gender");
    }
    user.gender = gender;
  }

  await user.save();

  // Keep the display name in the session cookie in sync.
  await createSession(user);

  return JSON.parse(JSON.stringify(user.toPublic()));
}

/** Email change is intentionally omitted: it needs re-verification. */
export async function getUserById(userId) {
  const requester = await getSessionUser();
  if (!requester) throw new Error("User not authenticated");

  await connectDB();

  const user = await User.findById(userId);

  return user ? JSON.parse(JSON.stringify(user.toPublic())) : null;
}
