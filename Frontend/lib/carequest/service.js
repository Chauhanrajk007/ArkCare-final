import crypto from "node:crypto";
import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import PatientResponse from "@/models/PatientResponse";
import HandoffCase from "@/models/HandoffCase";
import CaseEvent from "@/models/CaseEvent";
import CapsuleAward from "@/models/CapsuleAward";
import Patient from "@/models/Patient";
import Organization from "@/models/Organization";
import { awardCapsules } from "@/lib/carequest/capsules";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { getOrCreateDemoOrganization } from "@/lib/carequest/permissions";
import { emitCareQuestStaff } from "@/lib/carequest/realtime";

export async function createHandoffForOccurrence({
  occurrence,
  actorUserId,
  actorRole,
  summary,
  priority = "normal",
}) {
  let organization = occurrence.organization
    ? await Organization.findById(occurrence.organization)
    : null;
  if (!organization) organization = await getOrCreateDemoOrganization();

  const dedupeKey = "need-help:" + String(occurrence._id);
  const dueMinutes = organization.settings?.handoffDueMinutes || 240;
  const dueAt = new Date(Date.now() + dueMinutes * 60 * 1000);

  let handoff = await HandoffCase.findOne({ dedupeKey });
  if (!handoff) {
    try {
      handoff = await HandoffCase.create({
        dedupeKey,
        organization: organization._id,
        patient: occurrence.patient,
        carePlan: occurrence.carePlan,
        planVersion: occurrence.planVersion,
        occurrence: occurrence._id,
        priority,
        assignedRole: "coordinator",
        dueAt,
        summary: String(summary || "Patient requested help with a CareQuest mission").slice(0, 2000),
      });
    } catch (error) {
      if (error?.code === 11000) handoff = await HandoffCase.findOne({ dedupeKey });
      else throw error;
    }

    await CaseEvent.create({
      caseId: handoff._id,
      eventType: "case.created",
      actorUserId: String(actorUserId),
      actorRole,
      note: "Created from patient Need Help response",
    });

    await appendAuditEvent({
      organizationId: organization._id,
      programId: occurrence.program || null,
      actorUserId,
      actorRole,
      eventType: "handoff.created",
      resourceType: "HandoffCase",
      resourceId: handoff._id,
      verificationLevel: "self_report",
      metadata: { sourceOccurrenceId: String(occurrence._id), priority },
    });
  }

  await emitCareQuestStaff(
    handoff.organization || organization?._id,
    "handoff.updated",
    {
    caseId: String(handoff._id),
      status: handoff.status,
    }
  );

  return handoff;
}

export async function recordPatientMissionResponse({
  user,
  patient,
  occurrenceId,
  response,
  note = "",
  snoozeMinutes = 15,
}) {
  const allowed = new Set(["done", "not_done", "need_help", "snooze"]);
  if (!allowed.has(response)) throw new Error("Invalid mission response");

  const occurrence = await ScheduledOccurrence.findOne({
    _id: occurrenceId,
    patient: patient._id,
  });
  if (!occurrence) throw new Error("Mission not found");
  if (["cancelled", "completed", "expired"].includes(occurrence.status)) {
    throw new Error("This mission can no longer be changed");
  }

  if (response !== "snooze" && ["responded", "completed"].includes(occurrence.status)) {
    const existing = await PatientResponse.findOne({
      occurrence: occurrence._id,
      response: { $ne: "snooze" },
    }).sort({ reportedAt: -1 });
    return { occurrence, response: existing, duplicate: true };
  }

  if (occurrence.status !== "due") {
    throw new Error("This scheduled mission is not due yet");
  }

  if (response === "snooze") {
    const safeMinutes = Math.min(Math.max(Number(snoozeMinutes) || 15, 5), 1440);
    const snoozedUntil = new Date(Date.now() + safeMinutes * 60 * 1000);
    const responseKey =
      String(occurrence._id) + ":snooze:" + crypto.randomUUID();

    const recorded = await PatientResponse.create({
      responseKey,
      occurrence: occurrence._id,
      patient: patient._id,
      response,
      note: String(note || "").trim().slice(0, 2000),
      verificationLevel: "self_report",
      snoozedUntil,
    });

    occurrence.snoozeCount += 1;
    occurrence.currentResponse = "snooze";
    occurrence.scheduledFor = snoozedUntil;
    occurrence.status = "scheduled";
    await occurrence.save();

    await appendAuditEvent({
      organizationId: occurrence.organization,
      programId: occurrence.program,
      actorUserId: user._id,
      actorRole: user.role,
      eventType: "mission.snoozed",
      resourceType: "ScheduledOccurrence",
      resourceId: occurrence._id,
      verificationLevel: "self_report",
      metadata: { snoozedUntil: snoozedUntil.toISOString() },
    });

    return { occurrence, response: recorded, capsules: 0 };
  }

  const responseKey = String(occurrence._id) + ":final-response";
  let recorded = await PatientResponse.findOne({ responseKey });
  if (!recorded) {
    try {
      recorded = await PatientResponse.create({
        responseKey,
        occurrence: occurrence._id,
        patient: patient._id,
        response,
        note: String(note || "").trim().slice(0, 2000),
        verificationLevel: "self_report",
      });
    } catch (error) {
      if (error?.code === 11000) recorded = await PatientResponse.findOne({ responseKey });
      else throw error;
    }
  }

  occurrence.currentResponse = response;
  occurrence.status = "responded";
  await occurrence.save();

  const capsule = await awardCapsules({
    patient: patient._id,
    organization: occurrence.organization || null,
    program: occurrence.program || null,
    ruleId: "scheduled_response",
    sourceType: "ScheduledOccurrence",
    sourceId: occurrence._id,
    actorUserId: user._id,
    actorRole: user.role,
    verificationLevel: "self_report",
  });

  let handoff = null;
  if (response === "need_help") {
    handoff = await createHandoffForOccurrence({
      occurrence,
      actorUserId: user._id,
      actorRole: user.role,
      summary: note || "Patient requested help with: " + occurrence.title,
      priority: "normal",
    });
  }

  await appendAuditEvent({
    organizationId: occurrence.organization,
    programId: occurrence.program,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "mission.responded",
    resourceType: "ScheduledOccurrence",
    resourceId: occurrence._id,
    verificationLevel: "self_report",
    metadata: { response, capsuleAwardId: String(capsule.award?._id || "") },
  });

  return { occurrence, response: recorded, capsule: capsule.award, handoff };
}

export async function completeLearningMission({
  user,
  patient,
  occurrenceId,
  comprehension = "understood",
}) {
  const occurrence = await ScheduledOccurrence.findOne({
    _id: occurrenceId,
    patient: patient._id,
    activityType: "lesson",
  });
  if (!occurrence) throw new Error("Learning mission not found");
  if (occurrence.status === "completed") {
    const award = await CapsuleAward.findOne({
      patient: patient._id,
      sourceId: String(occurrence._id),
      ruleId: "lesson_completed",
    });
    return { duplicate: true, occurrence, award };
  }

  const allowedComprehension = new Set(["understood", "needs_clarification"]);
  if (!allowedComprehension.has(comprehension)) {
    throw new Error("Complete the comprehension check first");
  }

  const responseKey = String(occurrence._id) + ":lesson-completed";
  await PatientResponse.findOneAndUpdate(
    { responseKey },
    {
      $setOnInsert: {
        occurrence: occurrence._id,
        patient: patient._id,
        response: "lesson_completed",
        note: "Comprehension check: " + comprehension,
        verificationLevel: "system_confirmed",
      },
    },
    { upsert: true, new: true }
  );

  occurrence.status = "completed";
  await occurrence.save();

  const capsule = await awardCapsules({
    patient: patient._id,
    organization: occurrence.organization || null,
    program: occurrence.program || null,
    ruleId: "lesson_completed",
    sourceType: "ScheduledOccurrence",
    sourceId: occurrence._id,
    actorUserId: user._id,
    actorRole: user.role,
  });

  let handoff = null;
  if (comprehension === "needs_clarification") {
    handoff = await createHandoffForOccurrence({
      occurrence,
      actorUserId: user._id,
      actorRole: user.role,
      summary: "Patient completed the lesson but requested clarification.",
      priority: "normal",
    });
  }

  await appendAuditEvent({
    organizationId: occurrence.organization,
    programId: occurrence.program,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "lesson.completed",
    resourceType: "ScheduledOccurrence",
    resourceId: occurrence._id,
    verificationLevel: "system_confirmed",
    metadata: {
      capsuleAwardId: String(capsule.award?._id || ""),
      comprehension,
      clarificationRequested: Boolean(handoff),
    },
  });

  return { occurrence, award: capsule.award, handoff };
}

export async function recordAppointmentBooked(appointment, actorUserId = "appointment-system") {
  const followupQuery = {
    patient: appointment.patient,
    ownerDoctor: appointment.doctor,
    activityType: "follow_up",
    status: { $in: ["scheduled", "due", "responded"] },
    linkedAppointment: null,
  };
  if (appointment.organization) followupQuery.organization = appointment.organization;
  if (appointment.program) followupQuery.program = appointment.program;

  const occurrence = await ScheduledOccurrence.findOne(followupQuery).sort({
    scheduledFor: 1,
  });

  if (!occurrence) return null;

  occurrence.linkedAppointment = appointment._id;
  occurrence.status = "completed";
  await occurrence.save();

  const capsule = await awardCapsules({
    patient: appointment.patient,
    organization: appointment.organization || occurrence.organization || null,
    program: appointment.program || occurrence.program || null,
    ruleId: "follow_up_booked",
    sourceType: "Appointment",
    sourceId: appointment._id,
    actorUserId,
    actorRole: "patient",
  });

  await appendAuditEvent({
    organizationId: appointment.organization || occurrence.organization,
    programId: appointment.program || occurrence.program,
    actorUserId,
    actorRole: "patient",
    eventType: "followup.booked",
    resourceType: "Appointment",
    resourceId: appointment._id,
    verificationLevel: "system_confirmed",
    metadata: { occurrenceId: String(occurrence._id), capsuleAwardId: String(capsule.award?._id || "") },
  });

  return { occurrence, award: capsule.award };
}

export async function recordAppointmentCompleted(appointment, actorUserId = "appointment-system") {
  const occurrence = await ScheduledOccurrence.findOne({
    linkedAppointment: appointment._id,
    activityType: "follow_up",
  });
  if (!occurrence) return null;

  const capsule = await awardCapsules({
    patient: appointment.patient,
    organization: appointment.organization || occurrence.organization || null,
    program: appointment.program || occurrence.program || null,
    ruleId: "follow_up_attended",
    sourceType: "Appointment",
    sourceId: appointment._id,
    actorUserId,
    actorRole: "doctor",
    verificationLevel: "staff_documented",
  });

  await appendAuditEvent({
    organizationId: appointment.organization || occurrence.organization,
    programId: appointment.program || occurrence.program,
    actorUserId,
    actorRole: "doctor",
    eventType: "followup.attended",
    resourceType: "Appointment",
    resourceId: appointment._id,
    verificationLevel: "staff_documented",
    metadata: { occurrenceId: String(occurrence._id), capsuleAwardId: String(capsule.award?._id || "") },
  });

  return { occurrence, award: capsule.award };
}

export async function getPatientForUser(user) {
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");
  return patient;
}
