import crypto from "node:crypto";
import DoctorReport from "@/models/DoctorReport";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import Appointment from "@/models/Appointment";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { anchorAuditRoot, blockchainEnabled } from "@/lib/carequest/blockchain";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";
import { selectQuizQuestions } from "@/lib/carequest/quiz";
import { publishReportCarePlan } from "@/lib/carequest/reportToCarePlan";

function clean(value, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Canonical hash over the clinician-authored content only. AI structuring and
 * quiz selection are deliberately excluded: the chain proves what the doctor
 * wrote, not what the model later derived from it.
 */
function contentDigest({ clinicalSummary, patientActivity, prescriptionText, images }) {
  const canonical = JSON.stringify({
    clinicalSummary: clean(clinicalSummary),
    patientActivity: clean(patientActivity),
    prescriptionText: clean(prescriptionText),
    images: (images || [])
      .map((img) => ({ url: img.url, kind: img.kind || "prescription" }))
      .sort((a, b) => a.url.localeCompare(b.url)),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function sanitizeImages(images) {
  return (Array.isArray(images) ? images : [])
    .slice(0, 4)
    .map((img) => ({
      url: clean(img?.url, 500),
      publicId: clean(img?.publicId, 200),
      kind: ["prescription", "report_scan", "other"].includes(img?.kind)
        ? img.kind
        : "prescription",
      fileName: clean(img?.fileName, 200),
      ocrText: clean(img?.ocrText, 4000),
      ocrEngine: clean(img?.ocrEngine, 60),
    }))
    .filter((img) => img.url);
}

/**
 * Persist a reviewed report, anchor it on-chain, build the care plan + quiz,
 * and audit every step. This is the only path that creates a report, and it is
 * callable only with an authenticated, approved doctor who owns the
 * appointment.
 */
export async function publishDoctorReport({
  user,
  doctor,
  appointment,
  clinicalSummary,
  patientActivity,
  prescriptionText,
  images,
  parsed,
  aiMeta,
  doctorName,
}) {
  const contentHash = contentDigest({
    clinicalSummary,
    patientActivity,
    prescriptionText,
    images,
  });

  // Replay guard: identical content for the same appointment is not a new
  // revision.
  const existing = await DoctorReport.findOne({
    appointment: appointment._id,
    contentHash,
  }).lean();
  if (existing) {
    return { report: existing, created: false, plan: null };
  }

  let organizationId = appointment.organization || null;
  let programId = appointment.program || null;
  if (!organizationId || !programId) {
    const patient = await Patient.findById(appointment.patient);
    const context = await getPrimaryProgramContext(patient);
    organizationId = context.organization._id;
    programId = context.program._id;
  }

  const lastRevision = await DoctorReport.findOne({ appointment: appointment._id })
    .sort({ revision: -1 })
    .lean();
  const revision = (lastRevision?.revision || 0) + 1;

  // RAG quiz: retrieved from the quiz bank using the report + doctor remarks.
  const quizItems = selectQuizQuestions(parsed, 4);

  const report = await DoctorReport.create({
    organization: organizationId,
    program: programId,
    patient: appointment.patient,
    doctor: doctor._id,
    appointment: appointment._id,
    visitAt: appointment.appointmentDate,
    revision,
    title: clean(`Consultation report (rev ${revision})`, 200),
    clinicalSummary: clean(clinicalSummary),
    patientActivity: clean(patientActivity, 4000),
    prescriptionText: clean(prescriptionText),
    images: sanitizeImages(images),
    parsed: {
      conditions: parsed.conditions,
      medications: parsed.medications,
      activities: parsed.activities,
      remarkSummary: clean(parsed.remarkSummary, 4000),
      patientActivitySummary: clean(parsed.patientActivitySummary, 4000),
      followUpWindow: clean(parsed.followUpWindow, 200),
      keywords: parsed.keywords,
      ai: {
        model: clean(aiMeta?.model, 80),
        parseMode: ["text", "ocr", "hybrid", "rules_only"].includes(aiMeta?.parseMode)
          ? aiMeta.parseMode
          : "text",
        generatedAt: new Date(),
        warnings: (parsed.warnings || []).slice(0, 8),
        needsReview: Boolean(parsed.needsReview),
      },
    },
    quiz: { items: quizItems },
    contentHash,
    blockchain: {
      status: blockchainEnabled() ? "pending" : "disabled",
    },
    authoredByUserId: user._id.toString(),
    createdByRole: "doctor",
  });

  // Append-only audit: the doctor's report exists, regardless of chain state.
  await appendAuditEvent({
    organizationId,
    programId,
    actorUserId: user._id,
    actorRole: "doctor",
    eventType: "report.recorded",
    resourceType: "DoctorReport",
    resourceId: report._id,
    verificationLevel: "clinician_approved",
    metadata: {
      organizationId: String(organizationId || ""),
      programId: String(programId || ""),
      reportId: String(report._id),
      appointmentId: String(appointment._id),
      revision,
      contentHash,
      medicationCount: report.parsed.medications.length,
      hasPrescriptionImage: report.images.length > 0,
      hasPrescription: Boolean(clean(prescriptionText)) || report.images.length > 0,
      aiModel: report.parsed.ai.model,
      aiParseMode: report.parsed.ai.parseMode,
      aiNeedsReview: report.parsed.ai.needsReview,
      quizQuestionCount: quizItems.length,
    },
  });

  // Non-repudiation anchor. The batchId is revision-scoped so a later revision
  // anchors its own hash rather than being treated as a duplicate.
  if (blockchainEnabled()) {
    try {
      const batchId = "report:" + String(report._id) + ":r" + revision;
      const result = await anchorAuditRoot({
        batchId,
        merkleRoot: "0x" + contentHash,
      });
      report.blockchain.status = result.duplicate ? "anchored" : "anchored";
      report.blockchain.batchId = batchId;
      report.blockchain.merkleRoot = "0x" + contentHash;
      report.blockchain.txHash = result.txHash || "";
      report.blockchain.blockNumber = result.blockNumber ?? null;
      report.blockchain.anchoredAt = new Date();
      report.blockchain.error = "";
      await report.save();

      await appendAuditEvent({
        organizationId,
        programId,
        actorUserId: user._id,
        actorRole: "doctor",
        eventType: "report.anchored",
        resourceType: "DoctorReport",
        resourceId: report._id,
        verificationLevel: "clinician_approved",
        metadata: {
          organizationId: String(organizationId || ""),
          programId: String(programId || ""),
          reportId: String(report._id),
          contentHash,
          merkleRoot: "0x" + contentHash,
          txHash: result.txHash || "",
          blockNumber: result.blockNumber ?? null,
          network: result.network || "carequest-local-evm",
        },
      });
    } catch (error) {
      report.blockchain.status = "failed";
      report.blockchain.error = String(error?.message || "anchor failed").slice(0, 300);
      await report.save();
    }
  }

  // Doctor-authored report is the clinician approval; publish the derived plan.
  const plan = await publishReportCarePlan({
    report,
    parsed: report.parsed,
    actorUserId: user._id.toString(),
    doctorName,
  });

  return { report, created: true, plan };
}

export async function getDoctorReports({ doctorId, limit = 50 }) {
  const reports = await DoctorReport.find({ doctor: doctorId })
    .populate("patient", "name email userId")
    .populate("appointment", "appointmentDate status")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return reports;
}

export async function getPatientReports({ patientId, limit = 50 }) {
  const reports = await DoctorReport.find({ patient: patientId })
    .populate("doctor", "name specialization category")
    .populate("appointment", "appointmentDate status")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return reports;
}

export { contentDigest };
