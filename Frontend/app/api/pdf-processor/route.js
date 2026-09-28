import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import mongoose from 'mongoose';
import { getSessionUser } from '@/lib/auth';

export async function POST(request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== "patient") {
      return NextResponse.json({ error: "Patient access required" }, { status: 403 });
    }

    const userId = user._id.toString();

    await connectDB();
    
    // Query both collections directly
    const patient = await mongoose.connection.db.collection('patients').findOne({ userId });
    if (!patient) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    // Get files from form data
    const files = formData.getAll('files');
    
    if (!files || files.length === 0) {
      console.log('No files found in formData');
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json({ error: "Upload up to 5 reports at a time" }, { status: 400 });
    }

    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const aiFormData = new FormData();
    
    for (const file of files) {
      if (!file || !file.name) {
        console.log('Invalid file:', file);
        continue;
      }

      if (file.type !== "application/pdf" || file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "Each file must be a PDF no larger than 15MB" },
          { status: 400 }
        );
      }

      // Convert file to buffer for AI API
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      
      // Add each file to the same FormData with 'files' key
      aiFormData.append('files', blob, file.name);
    }

    // Send ALL files in ONE request to FastAPI
    const headers = {};
    if (process.env.AI_INTERNAL_TOKEN) {
      headers["X-ArkCare-Internal"] = process.env.AI_INTERNAL_TOKEN;
    }

    const response = await fetch(process.env.AI_PDF, {
      method: "POST",
      headers,
      body: aiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error:`, response.status, errorText);
      return NextResponse.json(
        { error: `AI API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const jsonResult = await response.json();
    // Save combined data to patient's lab_json field
    const parsedReports = jsonResult.parsed_json || [];
    const labSummary = parsedReports
      .map((report) => String(report?.summary || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);

    const labData = {
      parsed_json: parsedReports,
      pdf_download_url: jsonResult.pdf_download_url || null,
      processed_at: new Date().toISOString(),
      total_files_processed: jsonResult.total_files_processed || files.length,
      total_reports_merged: jsonResult.total_reports_merged || 0,
      unique_tests_found: jsonResult.unique_tests_found || 0,
      lab_summary: labSummary,
    };

    let healthData = {};
    try {
      healthData = patient.patientDescription
        ? JSON.parse(patient.patientDescription)
        : {};
    } catch {
      healthData = {};
    }

    healthData.lab_summary = labSummary;
    healthData.last_lab_update = new Date().toISOString();

    await mongoose.connection.db.collection('patients').updateOne(
      { userId },
      {
        $set: {
          lab_json: JSON.stringify(labData),
          patientDescription: JSON.stringify(healthData),
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${files.length} PDF files into combined report`,
      parsed_json: jsonResult.parsed_json,
      pdf_download_urls: jsonResult.pdf_download_url ? [
        {
            filename: files.length > 1 ? 'Combined Medical Report.pdf' : files[0].name.replace('.pdf', '_processed.pdf'),
            download_url: jsonResult.pdf_download_url
              ? `/api/report-download?path=${encodeURIComponent(jsonResult.pdf_download_url)}`
              : null
        }
    ] : [],
      total_files_processed: jsonResult.total_files_processed,
      total_reports_merged: jsonResult.total_reports_merged,
      unique_tests_found: jsonResult.unique_tests_found
    });

  } catch (error) {
    console.error('PDF processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF files: ' + error.message },
      { status: 500 }
    );
  }
}
