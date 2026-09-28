import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import connectDB from "@/lib/db";
import User from "@/models/User";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session";

/**
 * Server-side authentication helpers. This replaces `@clerk/nextjs/server`'s
 * `auth()` and `clerkClient()`.
 *
 * The authenticated user is a `User` document; `user._id.toString()` is what the
 * rest of the app (and the `userId` field on Patient/Doctor) treats as the id.
 */

export { SESSION_COOKIE };

/** Read + verify the session cookie. Returns the token payload or null. */
export async function getSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  return verifySessionToken(token);
}

/** Mint a token for a user document and install it as the session cookie. */
export async function createSession(user) {
  const token = await signSessionToken({
    sub: user._id.toString(),
    role: user.role ?? null,
    email: user.email,
    name: user.name,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return token;
}

/** Drop the session cookie. */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * The current user document, or null when signed out.
 * Use this everywhere `await auth()` used to be called.
 */
export async function getSessionUser() {
  const payload = await getSessionPayload();
  if (!payload) return null;

  await connectDB();

  const user = await User.findById(payload.sub);
  if (!user) return null;

  // The role always comes from the document, never from the cookie, so a role
  // change (e.g. picked on the landing page) takes effect immediately.
  return user;
}

/** Same as `getSessionUser()` but throws — for server actions. */
export async function requireUser() {
  const user = await getSessionUser();

  if (!user) throw new Error("User not authenticated");

  return user;
}

/**
 * Page guard: redirects to `/sign-in` (or `/`) when signed out / wrong role.
 * @param {"patient" | "doctor" | "nurse" | "coordinator" | "hospital_admin"} role
 */
export async function requireRole(role) {
  const user = await getSessionUser();

  if (!user) redirect("/sign-in");

  // Signed in but no role picked yet — send them to the landing page to choose.
  if (!user.role) redirect("/");

  if (user.role !== role) {
    const homes = {
      patient: "/patient",
      doctor: "/doctor",
      nurse: "/staff",
      coordinator: "/staff",
      hospital_admin: "/admin/carequest",
    };
    redirect(homes[user.role] || "/");
  }

  return user;
}

/** Register + sign in. */
export async function registerUser({ name, email, password, gender }) {
  await connectDB();

  const user = await User.register({ name, email, password, gender });

  user.lastLoginAt = new Date();
  await user.save({ timestamps: false });

  await createSession(user);

  return user;
}

/** Verify credentials + sign in. Returns null when the pair is invalid. */
export async function authenticateUser(email, password) {
  await connectDB();

  const user = await User.authenticate(email, password);
  if (!user) return null;

  user.lastLoginAt = new Date();
  await user.save({ timestamps: false });

  await createSession(user);

  return user;
}
