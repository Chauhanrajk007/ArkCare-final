import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Route protection backed by the MongoDB session cookie.
 *
 * The session token carries the user id and role, so authorization decisions
 * here need no database round-trip. Pages and server actions re-check the role
 * against the live `User` document — this layer is a fast first gate, not the
 * only one.
 */

const AUTH_ONLY_ROUTES = ["/chatbot", "/scanner"];

const PROTECTED_ROUTES = [
  { prefix: "/patient", roles: ["patient"] },
  { prefix: "/health", roles: ["patient"] },
  { prefix: "/reports", roles: ["patient"] },
  { prefix: "/doctor/onboarding", roles: ["doctor"] },
  { prefix: "/doctor", roles: ["doctor"] },
  { prefix: "/staff", roles: ["nurse", "coordinator"] },
  // The network directory lets any signed-in user (a patient, a doctor, an
  // admin) jump into the network explorer and one-click into another demo
  // account's dashboard, so it is open to every role but still requires a
  // session.
  {
    prefix: "/network",
    roles: [
      "patient",
      "doctor",
      "nurse",
      "coordinator",
      "hospital_admin",
      "platform_admin",
    ],
  },
  // The master/platform console lives under /admin/platform and is restricted
  // to platform_admin by the page itself. Other /admin pages (a hospital's own
  // program + audit) are hospital_admin, and a platform_admin may also read
  // them for the network view.
  { prefix: "/admin/platform", roles: ["platform_admin"] },
  { prefix: "/admin", roles: ["hospital_admin", "platform_admin"] },
];

export default async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL;

    if (origin && allowedOrigin && origin === allowedOrigin) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    return new NextResponse(null, { status: 204 });
  }

  const authOnly = AUTH_ONLY_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const rule = PROTECTED_ROUTES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!rule && !authOnly) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (authOnly && !rule) {
    return NextResponse.next();
  }

  // Signed in, but the role on the session is unset or wrong for this page.
  if (!session.role) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!rule.roles.includes(session.role)) {
    const homes = {
      patient: "/patient",
      doctor: "/doctor",
      nurse: "/staff",
      coordinator: "/staff",
      hospital_admin: "/admin/carequest",
    };
    return NextResponse.redirect(new URL(homes[session.role] || "/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
