"use server";

import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Appointment from "@/models/Appointment";
import CarePlan from "@/models/CarePlan";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import PlanVersion from "@/models/PlanVersion";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";
import { ensureCareQuestMembership } from "@/lib/carequest/permissions";

const ALLOWED_ACTIVITY_TYPES = new Set([
  "lesson",
  "reminder",
  "follow_up",
  "activity",
  "quiz",
]);
const ALLOWED_RECURRENCE = new Set(["once", "daily", "weekly", "custom"]);
const ALLOWED_SOURCE_TYPES = new Set([
  "clinician",
  "ai_draft",
  "document_summary",
]);

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function parseDate(value, fieldName, { required = false } = {}) {
  if (!value) {
    if (required) throw new Error(`${fieldName} is required`);
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid`);
  }

  return parsed;
}

function validateTimezone(timezone) {
  const value = cleanString(timezone || "UTC", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error("Choose a valid IANA time zone");
  }
  return value;
}

function normalizeActivityKey(value, index) {
  const cleaned = cleanString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || `activity-${index + 1}`;
}

function sanitizeActivities(activities) {
  if (!Array.isArray(activities) || activities.length < 1) {
    throw new Error("Add at least one care-plan activity");
  }
  if (activities.length > 50) {
    throw new Error("A care plan can contain at most 50 activities");
  }

  const seenKeys = new Set();

  return activities.map((activity, index) => {
    const type = cleanString(activity?.type, 30);
    if (!ALLOWED_ACTIVITY_TYPES.has(type)) {
      throw new Error(`Activity ${index + 1} has an invalid type`);
    }

    const title = cleanString(activity?.title, 160);
    const instructions = cleanString(activity?.instructions, 4000);
    if (!title || !instructions) {
      throw new Error(
        `Activity ${index + 1} needs both a title and instructions`
      );
    }

    let activityKey = normalizeActivityKey(activity?.activityKey, index);
    if (seenKeys.has(activityKey)) {
      activityKey = `${activityKey}-${index + 1}`;
    }
    seenKeys.add(activityKey);

    const recurrenceKind = cleanString(
      activity?.recurrence?.kind || "once",
      20
    );
    if (!ALLOWED_RECURRENCE.has(recurrenceKind)) {
      throw new Error(`Activity ${index + 1} has invalid recurrence`);
    }

    const timeLocal = cleanString(activity?.recurrence?.timeLocal, 5);
    if (timeLocal && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeLocal)) {
      throw new Error(
        `Activity ${index + 1} must use HH:MM for its local time`
      );
    }

    const rawDays = Array.isArray(activity?.recurrence?.daysOfWeek)
      ? activity.recurrence.daysOfWeek
      : [];
    const daysOfWeek = [
      ...new Set(
        rawDays
          .map(Number)
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      ),
    ].sort();

    const rawInterval = Number(activity?.recurrence?.interval || 1);
    const interval =
      Number.isInteger(rawInterval) && rawInterval >= 1 && rawInterval <= 365
        ? rawInterval
        : 1;

    let activityConfig;
    if (type === "activity") {
      const goalValue = Number(activity?.activityConfig?.goalValue || 5000);
      if (!Number.isInteger(goalValue) || goalValue < 250 || goalValue > 50000) {
        throw new Error(
          `Activity ${index + 1} must use a step goal between 250 and 50,000`
        );
      }
      activityConfig = {
        goalType: "steps",
        goalValue,
      };
    }

    return {
      activityKey,
      type,
      title,
      instructions,
      recurrence: {
        kind: recurrenceKind,
        timeLocal: timeLocal || undefined,
        daysOfWeek,
        interval,
      },
      safetyText: cleanString(activity?.safetyText, 2000),
      helpText: cleanString(activity?.helpText, 2000),
      activityConfig,
    };
  });
}

function sanitizePlanPayload(input) {
  const title = cleanString(input?.title, 160);
  if (!title) throw new Error("Care-plan title is required");

  const validFrom = parseDate(input?.validFrom, "Valid-from date", {
    required: true,
  });
  const validTo = parseDate(input?.validTo, "Valid-to date");
  if (validTo && validTo <= validFrom) {
    throw new Error("Valid-to date must be after valid-from date");
  }

  const sourceType = cleanString(input?.source?.type || "clinician", 30);
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    throw new Error("Invalid care-plan source");
  }

  return {
    title,
    summary: cleanString(input?.summary, 4000),
    validFrom,
    validTo,
    timezone: validateTimezone(input?.timezone),
    safetyText: cleanString(input?.safetyText, 3000),
    helpText: cleanString(input?.helpText, 3000),
    activities: sanitizeActivities(input?.activities),
    source: {
      type: sourceType,
      reference: cleanString(input?.source?.reference, 500),
    },
  };
}

async function requireApprovedDoctor() {
  const user = await requireUser();
  if (user.role !== "doctor") {
    throw new Error("Doctor access required");
  }

  await connectDB();

  const doctor = await Doctor.findOne({ userId: user._id.toString() });
  if (!doctor) throw new Error("Doctor profile not found");
  if (doctor.status !== "approved") {
    throw new Error("Only approved doctors can manage care plans");
  }

  const membership = await ensureCareQuestMembership(user, "doctor");
  if (!membership?.active) throw new Error("Active hospital membership required");

  return { user, doctor, membership };
}

async function getOwnedPlan(carePlanId, doctorId, organizationId = null) {
  if (!mongoose.isValidObjectId(carePlanId)) {
    throw new Error("Invalid care plan");
  }

  const query = {
    _id: carePlanId,
    ownerDoctor: doctorId,
  };
  if (organizationId) {
    query.$or = [
      { organization: organizationId },
      { organization: null },
      { organization: { $exists: false } },
    ];
  }

  const carePlan = await CarePlan.findOne(query);

  if (!carePlan) throw new Error("Care plan not found");
  return carePlan;
}

async function getDoctorAppointment(appointmentId, doctorId, organizationId = null) {
  if (!mongoose.isValidObjectId(appointmentId)) {
    throw new Error("Invalid appointment");
  }

  const query = {
    _id: appointmentId,
    doctor: doctorId,
    status: { $in: ["confirmed", "completed"] },
  };
  if (organizationId) {
    query.$or = [
      { organization: organizationId },
      { organization: null },
      { organization: { $exists: false } },
    ];
  }

  const appointment = await Appointment.findOne(query).populate("patient");

  if (!appointment || !appointment.patient) {
    throw new Error(
      "Care plans can only be created for your confirmed or completed appointments"
    );
  }

  return appointment;
}

function extractLabSummary(patient) {
  let summary = "";

  try {
    const healthData = patient?.patientDescription
      ? JSON.parse(patient.patientDescription)
      : {};
    summary = cleanString(healthData?.lab_summary, 12000);
  } catch {
    summary = "";
  }

  if (!summary) {
    try {
      const labData = patient?.lab_json ? JSON.parse(patient.lab_json) : {};
      summary = cleanString(labData?.lab_summary, 12000);
    } catch {
      summary = "";
    }
  }

  return summary;
}

export async function generateCarePlanDraftSuggestion(appointmentId) {
  const { doctor, membership } = await requireApprovedDoctor();
  const appointment = await getDoctorAppointment(
    appointmentId,
    doctor._id,
    membership.organization._id
  );
  const labSummary = extractLabSummary(appointment.patient);

  if (!labSummary) {
    throw new Error(
      "No processed report summary is available for this patient. Upload/process a report first, or author the plan manually."
    );
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You draft patient-friendly educational content for clinician review. " +
          "Do not diagnose, prescribe, recommend doses, change treatment, invent urgency, " +
          "or tell the patient to start/stop medicines. Use only the supplied report summary. " +
          "Return JSON with title, summary, lesson_title, lesson_body, " +
          "comprehension_questions (2-3 short strings), and follow_up_prompt. " +
          "The output is a draft and must never claim clinician approval.",
      },
      {
        role: "user",
        content:
          "Create a concise CareQuest educational draft from this processed medical-report summary. " +
          "Focus on helping the patient understand what is already documented and what questions " +
          "they may want to discuss with their clinician.\n\nREPORT SUMMARY:\n" +
          labSummary,
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error("AI draft service returned no content");

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    throw new Error("AI draft service returned invalid JSON");
  }

  const questions = Array.isArray(draft.comprehension_questions)
    ? draft.comprehension_questions
        .map((question) => cleanString(question, 300))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const lessonBody = cleanString(draft.lesson_body, 3000);
  const questionText = questions.length
    ? "\n\nQuestions to check understanding:\n" +
      questions.map((question, index) => `${index + 1}. ${question}`).join("\n")
    : "";

  return {
    title: cleanString(draft.title, 160) || "CareQuest report learning plan",
    summary:
      cleanString(draft.summary, 2000) ||
      "Patient-friendly educational draft based on the processed report summary.",
    safetyText:
      "This draft is educational only and does not change your treatment. Follow clinician-approved instructions and use local emergency services for emergencies.",
    helpText:
      "Write down questions and discuss them with your care team. Do not wait for an app response during an emergency.",
    source: {
      type: "ai_draft",
      reference: "existing-report-summary",
    },
    activities: [
      {
        activityKey: "report-learning",
        type: "lesson",
        title:
          cleanString(draft.lesson_title, 160) || "Understanding your report",
        instructions:
          (lessonBody ||
            "Review the report summary with your clinician and note anything you would like explained.") +
          questionText,
        recurrence: { kind: "once", interval: 1 },
        safetyText: "",
        helpText:
          "This lesson is a draft until your clinician reviews and approves the plan.",
      },
      {
        activityKey: "planned-follow-up",
        type: "follow_up",
        title: "Discuss at your planned follow-up",
        instructions:
          cleanString(draft.follow_up_prompt, 1000) ||
          "Bring your questions to the clinician-approved follow-up.",
        recurrence: { kind: "once", interval: 1 },
        safetyText: "",
        helpText: "Use ArkCare's existing appointment flow for the planned follow-up.",
      },
    ],
  };
}

export async function createCarePlanDraft(input) {
  const { user, doctor, membership } = await requireApprovedDoctor();
  const appointment = await getDoctorAppointment(
    input?.appointmentId,
    doctor._id,
    membership.organization._id
  );

  const existing = await CarePlan.findOne({
    sourceAppointment: appointment._id,
  }).lean();
  if (existing) {
    throw new Error(
      "A care plan already exists for this consultation. Open it to create a revision."
    );
  }

  const payload = sanitizePlanPayload(input);
  let organizationId = appointment.organization || null;
  let programId = appointment.program || null;

  if (!organizationId || !programId) {
    const context = await getPrimaryProgramContext(appointment.patient);
    organizationId = context.organization._id;
    programId = context.program._id;
    appointment.organization = organizationId;
    appointment.program = programId;
    await appointment.save();
  }

  const carePlan = await CarePlan.create({
    organization: organizationId,
    program: programId,
    patient: appointment.patient._id,
    ownerDoctor: doctor._id,
    sourceAppointment: appointment._id,
    status: "draft",
    currentVersion: 1,
    currentApprovedVersion: null,
    createdByUserId: user._id.toString(),
  });

  try {
    const version = await PlanVersion.create({
      carePlan: carePlan._id,
      versionNumber: 1,
      status: "draft",
      ...payload,
      createdByUserId: user._id.toString(),
    });

    const { appendAuditEvent } = await import("@/lib/carequest/audit");
    await appendAuditEvent({
      organizationId: carePlan.organization,
      programId: carePlan.program,
      actorUserId: user._id,
      actorRole: user.role,
      eventType: "careplan.draft.created",
      resourceType: "PlanVersion",
      resourceId: version._id,
      verificationLevel: "clinician_approved",
      metadata: {
        carePlanId: String(carePlan._id),
        organizationId: String(carePlan.organization || ""),
        programId: String(carePlan.program || ""),
        versionNumber: 1,
        sourceType: version.source?.type || "clinician",
      },
    });

    return serialize({ carePlan, version });
  } catch (error) {
    await CarePlan.deleteOne({ _id: carePlan._id, currentApprovedVersion: null });
    throw error;
  }
}

export async function updateCarePlanDraft(versionId, input) {
  const { user, doctor, membership } = await requireApprovedDoctor();

  if (!mongoose.isValidObjectId(versionId)) {
    throw new Error("Invalid plan version");
  }

  const version = await PlanVersion.findOne({
    _id: versionId,
    status: "draft",
  });
  if (!version) {
    throw new Error("Only draft plan versions can be edited");
  }

  const carePlan = await getOwnedPlan(version.carePlan, doctor._id, membership.organization._id);
  const payload = sanitizePlanPayload(input);

  version.title = payload.title;
  version.summary = payload.summary;
  version.validFrom = payload.validFrom;
  version.validTo = payload.validTo;
  version.timezone = payload.timezone;
  version.safetyText = payload.safetyText;
  version.helpText = payload.helpText;
  version.activities = payload.activities;
  version.source = payload.source;
  version.createdByUserId = user._id.toString();
  await version.save();

  carePlan.currentVersion = Math.max(
    carePlan.currentVersion,
    version.versionNumber
  );
  await carePlan.save();

  return serialize(version);
}

export async function startCarePlanRevision(carePlanId) {
  const { user, doctor, membership } = await requireApprovedDoctor();
  const carePlan = await getOwnedPlan(carePlanId, doctor._id, membership.organization._id);

  if (!carePlan.currentApprovedVersion) {
    throw new Error("Approve the first version before creating a revision");
  }

  const existingDraft = await PlanVersion.findOne({
    carePlan: carePlan._id,
    status: "draft",
  }).lean();
  if (existingDraft) {
    return serialize(existingDraft);
  }

  const current = await PlanVersion.findOne({
    carePlan: carePlan._id,
    versionNumber: carePlan.currentApprovedVersion,
    status: "approved",
  }).lean();

  if (!current) {
    throw new Error("Current approved plan version was not found");
  }

  const nextVersion = carePlan.currentVersion + 1;

  const revision = await PlanVersion.create({
    carePlan: carePlan._id,
    versionNumber: nextVersion,
    status: "draft",
    title: current.title,
    summary: current.summary,
    validFrom: current.validFrom,
    validTo: current.validTo,
    timezone: current.timezone,
    safetyText: current.safetyText,
    helpText: current.helpText,
    activities: current.activities,
    source: {
      type: "clinician",
      reference: `Revision of approved version ${current.versionNumber}`,
    },
    createdByUserId: user._id.toString(),
  });

  carePlan.currentVersion = nextVersion;
  await carePlan.save();

  return serialize(revision);
}

export async function approveCarePlanVersion(versionId) {
  const { user, doctor, membership } = await requireApprovedDoctor();

  if (!mongoose.isValidObjectId(versionId)) {
    throw new Error("Invalid plan version");
  }

  const version = await PlanVersion.findOne({
    _id: versionId,
    status: "draft",
  });
  if (!version) {
    throw new Error("Only a draft version can be approved");
  }

  const carePlan = await getOwnedPlan(version.carePlan, doctor._id, membership.organization._id);
  const appointment = await Appointment.findOne({
    _id: carePlan.sourceAppointment,
    doctor: doctor._id,
  }).lean();

  if (!appointment || appointment.status !== "completed") {
    throw new Error(
      "Mark the linked consultation completed before approving the patient-facing care plan"
    );
  }

  // Validate again at the trust boundary. AI-origin drafts and clinician drafts
  // use the same approval path; neither can bypass this doctor-authorized action.
  sanitizePlanPayload(version.toObject());

  const previousApprovedVersion = carePlan.currentApprovedVersion;

  version.status = "approved";
  version.approvedByUserId = user._id.toString();
  version.approvedAt = new Date();
  version.rejectedByUserId = null;
  version.rejectedAt = null;
  version.rejectionReason = "";
  await version.save();

  if (
    previousApprovedVersion &&
    previousApprovedVersion !== version.versionNumber
  ) {
    await PlanVersion.updateOne(
      {
        carePlan: carePlan._id,
        versionNumber: previousApprovedVersion,
        status: "approved",
      },
      { $set: { status: "superseded" } }
    );
  }

  carePlan.currentApprovedVersion = version.versionNumber;
  carePlan.currentVersion = Math.max(
    carePlan.currentVersion,
    version.versionNumber
  );
  carePlan.status = "active";
  await carePlan.save();

  const { generateOccurrencesForApprovedVersion } = await import("@/lib/carequest/scheduler");
  const { appendAuditEvent } = await import("@/lib/carequest/audit");

  const occurrences = await generateOccurrencesForApprovedVersion(carePlan, version);

  await appendAuditEvent({
    organizationId: carePlan.organization,
    programId: carePlan.program,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "careplan.approved",
    resourceType: "PlanVersion",
    resourceId: version._id,
    verificationLevel: "clinician_approved",
    metadata: {
      carePlanId: String(carePlan._id),
      organizationId: String(carePlan.organization || ""),
      programId: String(carePlan.program || ""),
      versionNumber: version.versionNumber,
      occurrenceCount: occurrences.length,
      previousApprovedVersion: previousApprovedVersion || null,
    },
  });

  return serialize({ carePlan, version, occurrenceCount: occurrences.length });
}

export async function rejectCarePlanVersion(versionId, reason) {
  const { user, doctor, membership } = await requireApprovedDoctor();

  if (!mongoose.isValidObjectId(versionId)) {
    throw new Error("Invalid plan version");
  }

  const rejectionReason = cleanString(reason, 2000);
  if (!rejectionReason) {
    throw new Error("Document a reason for rejecting this draft");
  }

  const version = await PlanVersion.findOne({
    _id: versionId,
    status: "draft",
  });
  if (!version) {
    throw new Error("Only a draft version can be rejected");
  }

  const carePlan = await getOwnedPlan(version.carePlan, doctor._id, membership.organization._id);

  version.status = "rejected";
  version.rejectedByUserId = user._id.toString();
  version.rejectedAt = new Date();
  version.rejectionReason = rejectionReason;
  await version.save();

  carePlan.status = carePlan.currentApprovedVersion ? "active" : "draft";
  await carePlan.save();

  const { appendAuditEvent } = await import("@/lib/carequest/audit");
  await appendAuditEvent({
    organizationId: carePlan.organization,
    programId: carePlan.program,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "careplan.draft.rejected",
    resourceType: "PlanVersion",
    resourceId: version._id,
    verificationLevel: "clinician_approved",
    metadata: {
      carePlanId: String(carePlan._id),
      versionNumber: version.versionNumber,
      reasonDocumented: true,
    },
  });

  return serialize(version);
}

export async function getDoctorCarePlanWorkspace() {
  const { doctor, membership } = await requireApprovedDoctor();

  const [appointments, plans] = await Promise.all([
    Appointment.find({
      doctor: doctor._id,
      status: { $in: ["confirmed", "completed"] },
      $or: [
        { organization: membership.organization._id },
        { organization: null },
        { organization: { $exists: false } },
      ],
    })
      .populate("patient", "name email userId")
      .sort({ appointmentDate: -1 })
      .lean(),
    CarePlan.find({
      ownerDoctor: doctor._id,
      $or: [
        { organization: membership.organization._id },
        { organization: null },
        { organization: { $exists: false } },
      ],
    })
      .populate("patient", "name email userId")
      .populate("sourceAppointment", "appointmentDate status reason")
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  const versions = await PlanVersion.find({
    carePlan: { $in: plans.map((plan) => plan._id) },
  })
    .sort({ carePlan: 1, versionNumber: -1 })
    .lean();

  const versionsByPlan = new Map();
  for (const version of versions) {
    const key = String(version.carePlan);
    if (!versionsByPlan.has(key)) versionsByPlan.set(key, []);
    versionsByPlan.get(key).push(version);
  }

  return serialize({
    appointments,
    plans: plans.map((plan) => ({
      ...plan,
      versions: versionsByPlan.get(String(plan._id)) || [],
    })),
  });
}

export async function getPatientApprovedCarePlans() {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Patient access required");
  }

  await connectDB();

  const patient = await Patient.findOne({
    userId: user._id.toString(),
  }).lean();
  if (!patient) return [];

  const plans = await CarePlan.find({
    patient: patient._id,
    currentApprovedVersion: { $ne: null },
    status: { $in: ["active", "paused", "completed"] },
  })
    .populate("ownerDoctor", "name specialization category")
    .populate("organization", "name slug")
    .populate("program", "name capsuleSymbol")
    .populate("sourceAppointment", "appointmentDate status")
    .sort({ updatedAt: -1 })
    .lean();

  const visible = [];
  for (const plan of plans) {
    const version = await PlanVersion.findOne({
      carePlan: plan._id,
      versionNumber: plan.currentApprovedVersion,
      status: "approved",
    }).lean();

    if (version) {
      visible.push({ ...plan, approvedVersion: version });
    }
  }

  return serialize(visible);
}
