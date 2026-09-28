import CarePlan from "@/models/CarePlan";
import PlanVersion from "@/models/PlanVersion";
import Appointment from "@/models/Appointment";
import Patient from "@/models/Patient";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { generateOccurrencesForApprovedVersion } from "@/lib/carequest/scheduler";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";

const SAFETY_TEXT =
  "This is a summary of your clinician's report. It does not replace the prescription itself. Take every medicine exactly as written on your prescription and never change a dose without speaking to your doctor.";

const MED_HELP_TEXT =
  "If a medicine name, dose or timing here does not match your prescription, use Need Help so your care team can correct it. Use local emergency services for emergencies.";

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function medLine(med) {
  return [med.name, med.dose, med.frequency, med.duration]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Turn a doctor-authored report (already reviewed + parsed) into the activity
 * set that becomes the patient's CareQuest care plan.
 *
 * The plan is clinician-derived: every instruction restates what the doctor
 * wrote. Nothing here invents clinical content — the AI only organised it, and
 * the doctor signed off before this function runs.
 */
export function buildReportActivities({ report, parsed, doctorName }) {
  const activities = [];
  const meds = Array.isArray(parsed.medications) ? parsed.medications : [];
  const parsedActivities = Array.isArray(parsed.activities)
    ? parsed.activities
    : [];

  // 1. Lesson that restates the consultation.
  const lessonLines = [];
  if (parsed.remarkSummary) lessonLines.push(parsed.remarkSummary);
  if (meds.length) {
    lessonLines.push("");
    lessonLines.push("Medicines your doctor recorded on your prescription:");
    for (const med of meds) {
      lessonLines.push("• " + medLine(med) + (med.instructions ? " — " + med.instructions : ""));
    }
  }
  if (parsed.patientActivitySummary) {
    lessonLines.push("");
    lessonLines.push("Activity your doctor advised: " + parsed.patientActivitySummary);
  }
  activities.push({
    activityKey: "report-lesson",
    type: "lesson",
    title: "Understand your consultation report",
    instructions:
      lessonLines.join("\n").trim() ||
      "Read the consultation summary your doctor recorded for this visit.",
    recurrence: { kind: "once", interval: 1 },
    safetyText: SAFETY_TEXT,
    helpText: MED_HELP_TEXT,
    sourceReport: report._id,
  });

  // 2. Daily medication check-in, only when there is a prescription to check on.
  if (meds.length) {
    activities.push({
      activityKey: "report-medication-checkin",
      type: "reminder",
      title: "Daily medication check-in",
      instructions:
        "Confirm how you are taking each medicine your doctor prescribed today. This is a " +
        "check-in, not proof that a dose was taken.\n\n" +
        meds.map((med) => "• " + medLine(med)).join("\n"),
      recurrence: { kind: "daily", timeLocal: "09:00", interval: 1 },
      safetyText: SAFETY_TEXT,
      helpText: MED_HELP_TEXT,
      sourceReport: report._id,
    });
  }

  // 3. The doctor's own activity advice, structured (cap to keep the plan usable).
  const activitySlots = parsedActivities.slice(0, 4);
  for (let i = 0; i < activitySlots.length; i += 1) {
    const item = activitySlots[i];
    const type = ["lesson", "reminder", "follow_up", "activity"].includes(item.type)
      ? item.type
      : "reminder";
    const base = {
      activityKey: `report-activity-${i + 1}`,
      type,
      title: clean(item.title, 160),
      instructions: clean(item.instructions, 4000),
      recurrence: {
        kind: ["once", "daily", "weekly"].includes(item.recurrenceKind)
          ? item.recurrenceKind
          : "once",
        timeLocal: item.timeLocal || (item.recurrenceKind === "daily" ? "09:00" : ""),
        interval: 1,
      },
      safetyText: clean(item.safetyText, 2000) || SAFETY_TEXT,
      helpText: MED_HELP_TEXT,
      sourceReport: report._id,
    };
    if (type === "activity") {
      base.activityConfig = {
        goalType: "steps",
        goalValue: item.goalValue || 5000,
      };
    }
    activities.push(base);
  }

  // 4. The planned follow-up.
  const window = clean(parsed.followUpWindow, 200);
  activities.push({
    activityKey: "report-followup",
    type: "follow_up",
    title: "Book your follow-up",
    instructions: window
      ? `Your doctor advised a follow-up ${window}. Book it through ArkCare's appointment flow.`
      : "Book the follow-up your doctor planned through ArkCare's appointment flow.",
    recurrence: { kind: "once", interval: 1 },
    safetyText: "Do not wait for a scheduled follow-up if you feel unwell.",
    helpText: "Use Need Help if you cannot arrange the follow-up.",
    sourceReport: report._id,
  });

  // 5. RAG knowledge check tied to this exact report.
  activities.push({
    activityKey: "report-quiz",
    type: "quiz",
    title: "Report knowledge check",
    instructions:
      "Answer 4 short questions about your consultation report and your doctor's remarks. " +
      "You earn Capsules for taking part, and more for correct answers.",
    recurrence: { kind: "once", interval: 1 },
    safetyText:
      "These are general public-health questions, not a test of your health and not medical advice.",
    helpText: "Use Need Help if any question is unclear.",
    sourceReport: report._id,
  });

  return activities;
}

function planTitleFor(doctorName) {
  return doctorName
    ? `CareQuest plan from ${doctorName}`
    : "CareQuest consultation plan";
}

/**
 * Create (or revise) the patient's CareQuest plan from a submitted report and
 * generate the resulting missions. The report submission is itself the
 * clinician's explicit, reviewed, on-chain-anchored action, so this publishes
 * an approved version on the doctor's behalf — it records the doctor as the
 * approver in the audit trail.
 */
export async function publishReportCarePlan({
  report,
  parsed,
  actorUserId,
  doctorName,
}) {
  const appointment = await Appointment.findById(report.appointment);
  if (!appointment) throw new Error("Linked appointment not found");

  let organizationId = report.organization || appointment.organization || null;
  let programId = report.program || appointment.program || null;
  if (!organizationId || !programId) {
    const patient = await Patient.findById(report.patient);
    const context = await getPrimaryProgramContext(patient);
    organizationId = context.organization._id;
    programId = context.program._id;
    appointment.organization = organizationId;
    appointment.program = programId;
    await appointment.save();
  }

  const activities = buildReportActivities({ report, parsed, doctorName });

  let carePlan = await CarePlan.findOne({ sourceAppointment: appointment._id });
  let versionNumber = 1;
  if (carePlan) {
    versionNumber = Math.max(carePlan.currentVersion, carePlan.currentApprovedVersion || 0) + 1;
  } else {
    carePlan = await CarePlan.create({
      organization: organizationId,
      program: programId,
      patient: report.patient,
      ownerDoctor: report.doctor,
      sourceAppointment: appointment._id,
      status: "draft",
      currentVersion: 1,
      createdByUserId: actorUserId,
    });
  }

  const version = await PlanVersion.create({
    carePlan: carePlan._id,
    versionNumber,
    status: "approved",
    title: planTitleFor(doctorName),
    summary:
      parsed.remarkSummary ||
      "Plan generated from the consultation report recorded by your doctor.",
    validFrom: new Date(),
    timezone: appointment.timezone || "Asia/Kolkata",
    safetyText: SAFETY_TEXT,
    helpText: MED_HELP_TEXT,
    activities,
    source: { type: "document_summary", reference: "report:" + String(report._id) },
    approvedByUserId: actorUserId,
    approvedAt: new Date(),
    createdByUserId: actorUserId,
  });

  // Supersede any prior approved version for the same plan.
  await PlanVersion.updateMany(
    {
      carePlan: carePlan._id,
      versionNumber: { $ne: version.versionNumber },
      status: "approved",
    },
    { $set: { status: "superseded" } }
  );

  carePlan.currentVersion = version.versionNumber;
  carePlan.currentApprovedVersion = version.versionNumber;
  carePlan.status = "active";
  await carePlan.save();

  const occurrences = await generateOccurrencesForApprovedVersion(carePlan, version);

  await appendAuditEvent({
    organizationId: carePlan.organization,
    programId: carePlan.program,
    actorUserId,
    actorRole: "doctor",
    eventType: "report.plan.published",
    resourceType: "PlanVersion",
    resourceId: version._id,
    verificationLevel: "clinician_approved",
    metadata: {
      carePlanId: String(carePlan._id),
      organizationId: String(carePlan.organization || ""),
      programId: String(carePlan.program || ""),
      versionNumber: version.versionNumber,
      reportId: String(report._id),
      appointmentId: String(appointment._id),
      occurrenceCount: occurrences.length,
      sourceType: "document_summary",
    },
  });

  return { carePlan, version, occurrences };
}
