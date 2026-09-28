import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { markOccurrenceDue } from "@/lib/carequest/scheduler";

function authorized(request) {
  const configured = process.env.CAREQUEST_JOB_SECRET;
  const supplied = request.headers.get("x-carequest-job-secret");
  return Boolean(configured && supplied && configured === supplied);
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized job request" }, { status: 401 });
  }

  await connectDB();
  const body = await request.json().catch(() => ({}));
  if (!body.occurrenceId) {
    return NextResponse.json({ error: "occurrenceId is required" }, { status: 400 });
  }

  const result = await markOccurrenceDue(body.occurrenceId);
  return NextResponse.json(result);
}
