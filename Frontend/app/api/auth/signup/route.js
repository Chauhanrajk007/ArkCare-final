import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";

export async function POST(request) {
  try {
    const { name, email, password, gender } = await request.json();

    const user = await registerUser({ name, email, password, gender });

    return NextResponse.json({ user: user.toPublic() }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);

    const message = error?.message || "Could not create account";

    // Duplicate email is a client mistake, not a server fault.
    const status = /already exists/i.test(message) ? 409 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
