"use server";

import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import Appointment from "@/models/Appointment";
import DoctorReport from "@/models/DoctorReport";
import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import CapsuleAward from "@/models/CapsuleAward";
import PatientResponse from "@/models/PatientResponse";
import { ensureCareQuestMembership } from "@/lib/carequest/permissions";
import { parseConsultationReport } from "@/lib/carequest/reportParser";
import { publishDoctorReport, getDoctorReports, getPatientReports } from "@/lib/carequest/reports";
import { selectQuizQuestions, toPatientSafeQuiz } from "@/lib/carequest/quiz";
import { awardCapsules, getCapsuleBalance, CAPSULE_DISPLAY_MAX } from "@/lib/carequest/capsules";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function requireApprovedDoctor() {
  const user = await requireUser();
  if (user.role !== "doctor") throw new Error("Doctor access required");
  await connectDB();
  const doctor = await Doctor.findOne({ userId: user._id.toString() });
  if (!doctor) throw new Error("Doctor profile not found");
  if (doctor.status !== "approved") throw new Error("Only approved doctors can file reports");
  const membership = await ensureCareQuestMembership(user, "doctor");
  if (!membership?.active) throw new Error("Active hospital membership required");
  return { user, doctor, membership };
}

async function requirePatient() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");
  return { user, patient };
}

// ---------------------------------------------------------------- doctor side

/**
 * Parse a draft report with AI and return a reviewable preview. This does not
 * persist anything — the doctor must call submitDoctorReport afterwards.
 */
export async function parseDoctorReportPreview(input) {
  await requireApprovedDoctor();
  const result = await parseConsultationReport(input);
  const quiz = selectQuizQuestions(result.parsed, 4);
  return serialize({
    parsed: result.parsed,
    model: result.model,
    parseMode: result.parseMode,
    warnings: result.warnings,
    ocr: result.ocr.map((o) => ({
      url: o.url,
      confidence: o.confidence ?? null,
      lowConfidence: Boolean(o.lowConfidence),
    })),
    // Correct answers are stripped: this preview never ships them anywhere.
    quizPreview: toPatientSafeQuiz(quiz),
  });
}

/**
 * Persist a reviewed report, anchor it, publish the derived care plan + quiz.
 * Idempotent on identical content.
 */
export async function submitDoctorReport(input) {
  const { user, doctor } = await requireApprovedDoctor();
  if (!mongoose.isValidObjectId(input?.appointmentId)) {
    throw new Error("Invalid appointment");
  }

  const appointment = await Appointment.findOne({
    _id: input.appointmentId,
    doctor: doctor._id,
  });
  if (!appointment) throw new Error("Appointment not found for this doctor");

  const clinicalSummary = String(input?.clinicalSummary || "").trim();
  if (!clinicalSummary) throw new Error("Consultation remarks are required");

  // Re-parse on submit so the persisted structure can never be a client-only
  // fabrication: the server always re-derives from the submitted raw text.
  const parseInput = {
    clinicalSummary,
    patientActivity: input?.patientActivity || "",
    prescriptionText: input?.prescriptionText || "",
    images: input?.images || [],
  };
  const ai = await parseConsultationReport(parseInput);

  const { report, created, plan } = await publishDoctorReport({
    user,
    doctor,
    appointment,
    clinicalSummary,
    patientActivity: parseInput.patientActivity,
    prescriptionText: parseInput.prescriptionText,
    images: parseInput.images,
    parsed: ai.parsed,
    aiMeta: { model: ai.model, parseMode: ai.parseMode },
    doctorName: doctor.name,
  });

  return serialize({
    created,
    reportId: String(report._id),
    revision: report.revision,
    contentHash: report.contentHash,
    blockchain: report.blockchain,
    warnings: ai.warnings,
    needsReview: Boolean(ai.parsed.needsReview),
    plan: plan
      ? {
          carePlanId: String(plan.carePlan._id),
          versionNumber: plan.version.versionNumber,
          occurrenceCount: plan.occurrences.length,
        }
      : null,
  });
}

/**
 * Doctor-side workspace: every patient this doctor has seen, the reports they
 * filed, and a per-patient activity/engagement summary.
 */
export async function getDoctorReportWorkspace() {
  const { doctor, membership } = await requireApprovedDoctor();

  const [reports, appointments, plans] = await Promise.all([
    getDoctorReports({ doctorId: doctor._id, limit: 100 }),
    Appointment.find({ doctor: doctor._id })
      .populate("patient", "name email userId")
      .sort({ appointmentDate: -1 })
      .limit(100)
      .lean(),
    (await import("@/models/CarePlan")).default
      .find({ ownerDoctor: doctor._id })
      .populate("patient", "name email userId")
      .lean(),
  ]);

  const patientIds = [
    ...new Set(
      [
        ...reports.map((r) => String(r.patient?._id || r.patient)),
        ...appointments.map((a) => String(a.patient?._id || a.patient)),
        ...plans.map((p) => String(p.patient?._id || p.patient)),
      ].filter(Boolean)
    ),
  ];

  const validPatientIds = patientIds.filter((id) => mongoose.isValidObjectId(id));

  const [occurrences, awards, capsuleTotals] = await Promise.all([
    ScheduledOccurrence.find({
      ownerDoctor: doctor._id,
      patient: { $in: validPatientIds },
    })
      .select("patient status activityType scheduledFor currentResponse")
      .lean(),
    CapsuleAward.find({ patient: { $in: validPatientIds } })
      .select("patient amount ruleId createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    validPatientIds.length
      ? CapsuleAward.aggregate([
          { $match: { patient: { $in: validPatientIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
      : Promise.resolve([]),
  ]);
  const capsulesOnChain = capsuleTotals[0]?.total || 0;

  const now = Date.now();
  const byPatient = new Map();
  const ensure = (id) => {
    if (!byPatient.has(id))
      byPatient.set(id, {
        patientId: id,
        name: "Patient",
        reports: 0,
        lastReportAt: null,
        medications: 0,
        anchored: 0,
        total: 0,
        missionsTotal: 0,
        missionsCompleted: 0,
        missionsDue: 0,
        capsulesEarned: 0,
      });
    return byPatient.get(id);
  };

  for (const appointment of appointments) {
    const id = String(appointment.patient?._id || appointment.patient);
    if (!id) continue;
    const row = ensure(id);
    if (appointment.patient?.name) row.name = appointment.patient.name;
  }
  for (const plan of plans) {
    const id = String(plan.patient?._id || plan.patient);
    if (!id) continue;
    const row = ensure(id);
    if (plan.patient?.name) row.name = plan.patient.name;
  }

  for (const report of reports) {
    const id = String(report.patient?._id || report.patient);
    if (!id) continue;
    const row = ensure(id);
    if (report.patient?.name) row.name = report.patient.name;
    row.reports += 1;
    row.medications += report.parsed?.medications?.length || 0;
    if (report.blockchain?.status === "anchored") row.anchored += 1;
    const t = new Date(report.createdAt).getTime();
    if (!row.lastReportAt || t > row.lastReportAt) row.lastReportAt = t;
  }

  for (const occ of occurrences) {
    const id = String(occ.patient);
    const row = ensure(id);
    row.total += 1;
    if (["completed", "responded"].includes(occ.status)) row.missionsCompleted += 1;
    else if (occ.status === "due") row.missionsDue += 1;
    row.missionsTotal += 1;
  }

  for (const award of awards) {
    const id = String(award.patient);
    if (!byPatient.has(id)) continue;
    const row = byPatient.get(id);
    row.capsulesEarned += Math.max(0, Number(award.amount || 0));
  }

  const rows = [...byPatient.values()].sort(
    (a, b) => (b.lastReportAt || 0) - (a.lastReportAt || 0)
  );

  // Attach the doctor's own hospital + its reputation score so the doctor (and
  // an auditor) can verify which hospital's reputation the reported capsules
  // roll up to, alongside the patient they consulted.
  let hospital = { name: null, slug: null, reputationScore: null, reputationLabel: null, totalCapsules: null };
  try {
    const { getHospitalProfile } = await import("@/lib/carequest/hospitals");
    const profile = await getHospitalProfile(membership.organization._id);
    if (profile) {
      hospital = {
        name: profile.name,
        slug: profile.slug,
        reputationScore: profile.reputationScore,
        reputationLabel: profile.reputationLabel,
        totalCapsules: profile.totalCapsules,
      };
    }
  } catch {
    // reputation is informational; never block the report list
  }

  return serialize({
    doctor: {
      name: doctor.name,
      specialization: doctor.specialization,
      hospital: hospital.name,
    },
    hospital,
    patients: rows,
    reports: reports.map((r) => ({
      _id: r._id,
      patientId: String(r.patient?._id || r.patient),
      patientName: r.patient?.name,
      hospitalName: hospital.name,
      hospitalReputationScore: hospital.reputationScore,
      appointmentDate: r.appointment?.appointmentDate,
      revision: r.revision,
      clinicalSummary: r.clinicalSummary,
      medications: r.parsed?.medications || [],
      remarkSummary: r.parsed?.remarkSummary,
      aiNeedsReview: r.parsed?.ai?.needsReview,
      aiModel: r.parsed?.ai?.model,
      aiParseMode: r.parsed?.ai?.mode,
      images: (r.images || []).map((i) => i.url),
      contentHash: r.contentHash,
      blockchain: r.blockchain,
      createdAt: r.createdAt,
    })),
    totals: {
      patients: rows.length,
      reports: reports.length,
      capsulesOnChain,
    },
    now,
  });
}

// --------------------------------------------------------------- patient side

/** Reports + quiz status for the patient's CareQuest page. */
export async function getPatientReportTimeline() {
  const { patient } = await requirePatient();
  const reports = await getPatientReports({ patientId: patient._id, limit: 50 });
  return serialize(
    reports.map((r) => ({
      _id: r._id,
      doctorName: r.doctor?.name,
      doctorSpecialization: r.doctor?.specialization,
      appointmentDate: r.appointment?.appointmentDate,
      revision: r.revision,
      remarkSummary: r.parsed?.remarkSummary || r.clinicalSummary,
      clinicalSummary: r.clinicalSummary,
      patientActivity: r.patientActivity,
      medications: r.parsed?.medications || [],
      conditions: r.parsed?.conditions || [],
      followUpWindow: r.parsed?.followUpWindow,
      images: (r.images || []).map((i) => i.url),
      contentHash: r.contentHash,
      blockchain: r.blockchain,
      createdAt: r.createdAt,
      quizCount: r.quiz?.items?.length || 0,
      // Patient-safe view: options only, never the correct answer.
      quizQuestions: toPatientSafeQuiz(r.quiz?.items || []),
      quizCompleted: Boolean(r.quiz?.result?.submittedAt),
      quizScore: r.quiz?.result
        ? { correct: r.quiz.result.correctCount, total: r.quiz.result.total }
        : null,
      awardedCapsules: r.quiz?.result?.awardedCapsules || 0,
    }))
  );
}

/**
 * Grade a report's 4-question RAG quiz server-side, award capsules, and mark
 * the linked quiz mission complete. Correct answers never reach the client.
 */
export async function submitReportQuiz(reportId, answers) {
  const { user, patient } = await requirePatient();
  if (!mongoose.isValidObjectId(reportId)) throw new Error("Invalid report");

  const report = await DoctorReport.findOne({ _id: reportId, patient: patient._id });
  if (!report) throw new Error("Report not found");
  if (report.quiz?.result?.submittedAt) {
    return serialize({ duplicate: true, ...report.quiz.result });
  }

  const items = report.quiz?.items || [];
  if (!items.length) throw new Error("This report has no quiz");

  const submitted = Array.isArray(answers) ? answers : [];
  let correctCount = 0;
  const graded = items.map((item, index) => {
    const picked = String(submitted[index] ?? "");
    const isCorrect = picked.trim() === String(item.correctAnswer).trim();
    if (isCorrect) correctCount += 1;
    return {
      questionId: item.questionId,
      picked,
      correctAnswer: item.correctAnswer,
      isCorrect,
      explanation: item.explanation,
    };
  });

  // Participation credit + one capsule per correct answer.
  const awarded = 1 + correctCount;
  const capsule = await awardCapsules({
    patient: patient._id,
    organization: report.organization || null,
    program: report.program || null,
    ruleId: "quiz_completed",
    sourceType: "DoctorReport",
    sourceId: report._id,
    actorUserId: user._id,
    actorRole: user.role,
    verificationLevel: "system_confirmed",
    amount: awarded,
  });

  report.quiz.result = {
    submittedAt: new Date(),
    answers: graded.map((g) => g.picked),
    correctCount,
    total: items.length,
    awardedCapsules: capsule.award ? capsule.award.amount : 0,
    capsuleAwardId: capsule.award ? String(capsule.award._id) : "",
  };
  await report.save();

  // Mark the linked quiz mission complete so the timeline reflects it.
  const occurrence = await ScheduledOccurrence.findOne({
    patient: patient._id,
    sourceReport: report._id,
    activityType: "quiz",
    status: { $ne: "completed" },
  });
  if (occurrence) {
    occurrence.status = "completed";
    await occurrence.save();
  }

  await appendAuditEvent({
    organizationId: report.organization,
    programId: report.program,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "quiz.completed",
    resourceType: "DoctorReport",
    resourceId: report._id,
    verificationLevel: "system_confirmed",
    metadata: {
      organizationId: String(report.organization || ""),
      programId: String(report.program || ""),
      reportId: String(report._id),
      correctCount,
      total: items.length,
      awardedCapsules: report.quiz.result.awardedCapsules,
      capsuleAwardId: report.quiz.result.capsuleAwardId,
      occurrenceId: occurrence ? String(occurrence._id) : "",
    },
  });

  // Best-effort chain proof of the ledger, never clinical-critical.
  if (process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true") {
    try {
      const { syncPatientCapsulesToBlockchain } = await import("@/actions/blockchainActions");
      await syncPatientCapsulesToBlockchain();
    } catch {
      // Blockchain is non-clinical.
    }
  }

  return serialize({
    duplicate: false,
    correctCount,
    total: items.length,
    awardedCapsules: report.quiz.result.awardedCapsules,
    graded: graded.map((g) => ({
      questionId: g.questionId,
      isCorrect: g.isCorrect,
      correctAnswer: g.correctAnswer,
      explanation: g.explanation,
    })),
  });
}

/** Lightweight balance for the animated capsule gauge. */
export async function getCapsuleGauge() {
  const { patient } = await requirePatient();
  const context = await getPrimaryProgramContext(patient);
  const balance = await getCapsuleBalance(patient._id, context.program._id);
  return serialize({
    balance,
    symbol: context.program.capsuleSymbol,
    programName: context.program.name,
    max: CAPSULE_DISPLAY_MAX,
  });
}
