import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  processDueOccurrences,
  scheduleUpcomingWindow,
} from "@/lib/carequest/scheduler";

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
  const due = await processDueOccurrences();
  const queued = await scheduleUpcomingWindow();

  return NextResponse.json({
    success: true,
    dueProcessed: due.length,
    queued: queued.filter((item) => item.queued).length,
    deferred: queued.filter((item) => !item.queued).length,
  });
}
