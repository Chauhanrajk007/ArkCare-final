import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findApprovedDoctorsForAI } from "@/lib/doctorDirectory";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "patient") {
      return NextResponse.json(
        { error: "AI Guide is available to patient accounts" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    if (process.env.AI_INTERNAL_TOKEN) {
      headers.append("X-ArkCare-Internal", process.env.AI_INTERNAL_TOKEN);
    }

    const response = await fetch(process.env.AI_CHAT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        thread_id: body?.thread_id || "default",
      }),
      redirect: "follow",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error:", response.status, errorText);
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const analysis = data?.analysis || {};

    await connectDB();
    const patient = await Patient.findOne({
      userId: user._id.toString(),
    }).lean();
    if (!patient) {
      return NextResponse.json(
        { error: "Patient profile not found" },
        { status: 404 }
      );
    }

    const programContext = await getPrimaryProgramContext(patient);

    // The LLM supplies only triage/specialty intent. Every actual clinician
    // identity, fee and availability is resolved from active MongoDB doctors
    // assigned to this patient's hospital at request time.
    const specialists = await findApprovedDoctorsForAI({
      prompt,
      recommendedSpecialty: analysis.recommended_specialty || "",
      detectedConditions: analysis.detected_conditions || [],
      organizationId: programContext.organization._id,
      limit: 3,
    });

    return NextResponse.json({
      ...data,
      specialists,
      doctor_source: "mongodb_live",
      doctor_directory_refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to connect to AI backend: " + error.message },
      { status: 500 }
    );
  }
}
