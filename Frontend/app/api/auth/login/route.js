import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    const user = await authenticateUser(email, password);

    // One message for both "no such user" and "wrong password" so the endpoint
    // can't be used to enumerate registered emails.
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    return NextResponse.json({ user: user.toPublic() });
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { error: "Could not sign you in" },
      { status: 500 }
    );
  }
}
