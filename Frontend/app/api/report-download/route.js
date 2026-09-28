import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";

export async function GET(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "patient") {
      return NextResponse.json({ error: "Patient access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || !path.startsWith("/download_report/") || path.includes("..")) {
      return NextResponse.json({ error: "Invalid report path" }, { status: 400 });
    }

    await connectDB();
    const patient = await Patient.findOne({ userId: user._id.toString() }).lean();

    let storedReportPath = null;
    try {
      storedReportPath = patient?.lab_json
        ? JSON.parse(patient.lab_json)?.pdf_download_url
        : null;
    } catch {
      storedReportPath = null;
    }

    if (!storedReportPath || storedReportPath !== path) {
      return NextResponse.json({ error: "Report does not belong to this session" }, { status: 403 });
    }

    if (!process.env.AI_PDF) {
      return NextResponse.json({ error: "AI backend is not configured" }, { status: 500 });
    }

    const backendUrl = new URL(path, process.env.AI_PDF);
    const headers = {};
    if (process.env.AI_INTERNAL_TOKEN) {
      headers["X-ArkCare-Internal"] = process.env.AI_INTERNAL_TOKEN;
    }

    const response = await fetch(backendUrl, { headers, cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ error: "Report is no longer available" }, { status: response.status });
    }

    const bytes = await response.arrayBuffer();
    const filename = decodeURIComponent(path.split("/").pop() || "arkcare-report.pdf");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Report download proxy failed:", error);
    return NextResponse.json({ error: "Could not download report" }, { status: 500 });
  }
}
