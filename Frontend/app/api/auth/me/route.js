import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/** Lets the client auth provider hydrate itself from the session cookie. */
export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    return NextResponse.json({ user: user.toPublic() });
  } catch (error) {
    console.error("Session lookup error:", error);

    return NextResponse.json({ user: null }, { status: 200 });
  }
}
