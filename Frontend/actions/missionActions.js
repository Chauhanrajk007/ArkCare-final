"use server";

import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import UserPreference from "@/models/UserPreference";
import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import PatientResponse from "@/models/PatientResponse";
import CapsuleAward from "@/models/CapsuleAward";
import HandoffCase from "@/models/HandoffCase";
import ReminderDelivery from "@/models/ReminderDelivery";
import { getCapsuleBalance, getSimulatedBenefitEligibility } from "@/lib/carequest/capsules";
import {
  completeLearningMission,
  getPatientForUser,
  recordPatientMissionResponse,
} from "@/lib/carequest/service";
import { markOccurrenceDue } from "@/lib/carequest/scheduler";
import { getProgramForPatient } from "@/lib/carequest/programs";

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateTimezone(timezone) {
  const value = String(timezone || "Asia/Kolkata").trim().slice(0, 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error("Choose a valid IANA time zone");
  }
  return value;
}

async function requirePatient() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  await connectDB();
  const patient = await getPatientForUser(user);
  return { user, patient };
}

export async function getPatientMissionDashboard() {
  const { user, patient } = await requirePatient();
  const [occurrences, responses, awards, preference, openHandoffs, balance] =
    await Promise.all([
      ScheduledOccurrence.find({
        patient: patient._id,
        status: { $ne: "cancelled" },
      })
        .populate("ownerDoctor", "name specialization")
        .populate("linkedAppointment", "appointmentDate status")
        .sort({ scheduledFor: 1 })
        .limit(200)
        .lean(),
      PatientResponse.find({ patient: patient._id })
        .sort({ reportedAt: -1 })
        .limit(100)
        .lean(),
      CapsuleAward.find({ patient: patient._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      UserPreference.findOne({ userId: user._id.toString() }).lean(),
      HandoffCase.find({
        patient: patient._id,
        status: { $ne: "resolved" },
      })
        .sort({ createdAt: -1 })
        .lean(),
      getCapsuleBalance(patient._id),
    ]);

  return serialize({
    userId: user._id.toString(),
    occurrences,
    responses,
    awards,
    preference:
      preference ||
      ({
        careQuestOptIn: true,
        paused: false,
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        quietHours: { enabled: false, start: "22:00", end: "07:00" },
        celebrationEnabled: false,
      }),
    openHandoffs,
    capsuleBalance: balance,
    simulatedBenefit: getSimulatedBenefitEligibility(balance),
  });
}

export async function respondToMission(occurrenceId, response, note = "", snoozeMinutes = 15) {
  const { user, patient } = await requirePatient();
  const result = await recordPatientMissionResponse({
    user,
    patient,
    occurrenceId,
    response,
    note,
    snoozeMinutes,
  });

  if (process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true") {
    try {
      const { syncPatientCapsulesToBlockchain } = await import("@/actions/blockchainActions");
      await syncPatientCapsulesToBlockchain();
    } catch {
      // Blockchain is non-clinical and must never block a patient response.
    }
  }

  return serialize(result);
}

export async function completeLessonMission(
  occurrenceId,
  comprehension = "understood"
) {
  const { user, patient } = await requirePatient();
  const result = await completeLearningMission({
    user,
    patient,
    occurrenceId,
    comprehension,
  });

  if (process.env.CAREQUEST_BLOCKCHAIN_ENABLED === "true") {
    try {
      const { syncPatientCapsulesToBlockchain } = await import("@/actions/blockchainActions");
      await syncPatientCapsulesToBlockchain();
    } catch {
      // Clinical/engagement state remains authoritative if blockchain is unavailable.
    }
  }

  return serialize(result);
}

export async function updateCareQuestPreferences(input) {
  const { user } = await requirePatient();
  const timezone = validateTimezone(input?.timezone);
  const locale = String(input?.locale || "en-IN").trim().slice(0, 20);
  const quietStart = String(input?.quietHours?.start || "22:00");
  const quietEnd = String(input?.quietHours?.end || "07:00");
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(quietStart) || !hhmm.test(quietEnd)) {
    throw new Error("Quiet hours must use HH:MM");
  }

  const preference = await UserPreference.findOneAndUpdate(
    { userId: user._id.toString() },
    {
      $set: {
        careQuestOptIn: input?.careQuestOptIn !== false,
        paused: Boolean(input?.paused),
        timezone,
        locale,
        accessibility: {
          reducedMotion: Boolean(input?.accessibility?.reducedMotion),
          largerText: Boolean(input?.accessibility?.largerText),
          audioSupport: Boolean(input?.accessibility?.audioSupport),
        },
        quietHours: {
          enabled: Boolean(input?.quietHours?.enabled),
          start: quietStart,
          end: quietEnd,
        },
        revealSensitiveLockScreenText: Boolean(input?.revealSensitiveLockScreenText),
        celebrationEnabled: Boolean(input?.celebrationEnabled),
      },
    },
    { upsert: true, new: true }
  );

  return serialize(preference);
}

export async function makeNextSyntheticMissionDue(programId = null) {
  const { user, patient } = await requirePatient();
  if (user.email !== "demo.patient@arkcare.local") {
    throw new Error("Accelerated demo clock is limited to the synthetic demo patient");
  }

  const query = {
    patient: patient._id,
    status: "scheduled",
  };

  if (programId) {
    const context = await getProgramForPatient(patient, programId);
    query.organization = context.organization._id;
    query.program = context.program._id;
  }

  const occurrence = await ScheduledOccurrence.findOne(query).sort({
    scheduledFor: 1,
  });

  if (!occurrence) return { success: false, reason: "no_scheduled_occurrence" };

  occurrence.scheduledFor = new Date();
  await occurrence.save();
  return serialize(
    await markOccurrenceDue(occurrence._id, {
      id: user._id.toString(),
      role: "demo-clock",
    })
  );
}


export async function simulateSyntheticDeliveryFailure(programId = null) {
  const { user, patient } = await requirePatient();
  if (user.email !== "demo.patient@arkcare.local") {
    throw new Error("Delivery-failure simulation is limited to synthetic demo data");
  }

  const query = {
    patient: patient._id,
    status: { $in: ["scheduled", "due"] },
  };

  if (programId) {
    const context = await getProgramForPatient(patient, programId);
    query.organization = context.organization._id;
    query.program = context.program._id;
  }

  const occurrence = await ScheduledOccurrence.findOne(query).sort({
    scheduledFor: 1,
  });

  if (!occurrence) return { success: false, reason: "no_occurrence" };

  occurrence.deliveryStatus = "failed";
  await occurrence.save();

  await ReminderDelivery.findOneAndUpdate(
    { deliveryKey: occurrence.occurrenceKey + ":in_app" },
    {
      $setOnInsert: {
        occurrence: occurrence._id,
        patient: patient._id,
        channel: "in_app",
      },
      $set: {
        status: "failed",
        failureCode: "DEMO_PROVIDER_FAILURE",
      },
      $inc: { attempts: 1 },
    },
    { upsert: true, new: true }
  );

  const { appendAuditEvent } = await import("@/lib/carequest/audit");
  await appendAuditEvent({
    organizationId: occurrence.organization,
    programId: occurrence.program,
    actorUserId: user._id,
    actorRole: "demo-clock",
    eventType: "reminder.delivery.failed",
    resourceType: "ScheduledOccurrence",
    resourceId: occurrence._id,
    verificationLevel: "system_confirmed",
    metadata: { failureCode: "DEMO_PROVIDER_FAILURE" },
  });

  return { success: true, occurrenceId: String(occurrence._id) };
}
