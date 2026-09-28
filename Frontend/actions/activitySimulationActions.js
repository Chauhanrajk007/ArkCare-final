"use server";

import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import ActivitySession from "@/models/ActivitySession";
import DeviceEvidence from "@/models/DeviceEvidence";
import MiningSimulation from "@/models/MiningSimulation";
import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import { getProgramForPatient } from "@/lib/carequest/programs";
import { awardCapsules } from "@/lib/carequest/capsules";
import { appendAuditEvent } from "@/lib/carequest/audit";

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function requirePatientContext() {
  const user = await requireUser();
  if (user.role !== "patient") throw new Error("Patient access required");
  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");
  return { user, patient };
}

export async function startActivitySimulation(
  programId,
  occurrenceId,
  deviceSource = "demo_health_connect"
) {
  const { user, patient } = await requirePatientContext();
  const context = await getProgramForPatient(patient, programId);

  if (!context.membership.consents?.simulatedActivityData) {
    throw new Error("Enable simulated activity-data consent before starting this demo mission");
  }

  const occurrence = await ScheduledOccurrence.findOne({
    _id: occurrenceId,
    patient: patient._id,
    organization: context.organization._id,
    program: context.program._id,
    activityType: "activity",
  });
  if (!occurrence) {
    throw new Error("A clinician-approved activity mission is required");
  }
  if (occurrence.status !== "due") {
    throw new Error("This clinician-approved activity mission is not due yet");
  }

  const allowedSources = new Set([
    "demo_health_connect",
    "demo_healthkit",
    "manual_demo",
  ]);
  if (!allowedSources.has(deviceSource)) throw new Error("Unsupported demo device source");

  const existingSession = await ActivitySession.findOne({
    patient: patient._id,
    organization: context.organization._id,
    program: context.program._id,
    missionOccurrence: occurrence._id,
    isSimulation: true,
    status: { $in: ["active", "paused", "submitted", "verified", "completed"] },
  }).sort({ createdAt: -1 });
  if (existingSession) return serialize(existingSession);

  const session = await ActivitySession.create({
    sessionKey: crypto.randomUUID(),
    patient: patient._id,
    organization: context.organization._id,
    program: context.program._id,
    missionOccurrence: occurrence._id,
    goalType: "steps",
    goalValue:
      occurrence.activityConfig?.goalValue ||
      context.program.rules?.activityGoalSteps ||
      5000,
    status: "active",
    deviceSource,
    reportedValue: 0,
    verifiedValue: 0,
    isSimulation: true,
    startedAt: new Date(),
  });

  await appendAuditEvent({
    organizationId: context.organization._id,
    programId: context.program._id,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "activity.simulation.started",
    resourceType: "ActivitySession",
    resourceId: session._id,
    verificationLevel: "system_confirmed",
    metadata: {
      organizationId: String(context.organization._id),
      programId: String(context.program._id),
      isSimulation: true,
      deviceSource,
      goalValue: session.goalValue,
      occurrenceId: String(occurrence._id),
    },
  });

  return serialize(session);
}

export async function completeActivitySimulation(sessionId) {
  const { user, patient } = await requirePatientContext();
  const session = await ActivitySession.findOne({
    _id: sessionId,
    patient: patient._id,
    isSimulation: true,
  });
  if (!session) throw new Error("Activity simulation session not found");

  const context = await getProgramForPatient(patient, session.program);
  const occurrence = session.missionOccurrence
    ? await ScheduledOccurrence.findOne({
        _id: session.missionOccurrence,
        patient: patient._id,
        organization: context.organization._id,
        program: context.program._id,
        activityType: "activity",
      })
    : null;
  if (!occurrence) {
    throw new Error("Approved activity occurrence is no longer available");
  }

  const evidenceKey = String(session._id) + ":synthetic-final";
  let evidence = await DeviceEvidence.findOne({ evidenceKey });
  const duplicate = Boolean(evidence);

  const finalSteps = session.goalValue;
  const durationMinutes = 28;
  const distanceKm = Math.round(finalSteps * 0.00072 * 100) / 100;

  if (!evidence) {
    try {
      evidence = await DeviceEvidence.create({
        evidenceKey,
        activitySession: session._id,
        patient: patient._id,
        organization: context.organization._id,
        program: context.program._id,
        source: session.deviceSource,
        steps: finalSteps,
        distanceKm,
        durationMinutes,
        isSynthetic: true,
        verificationStatus: "accepted",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      evidence = await DeviceEvidence.findOne({ evidenceKey });
      if (!evidence) throw error;
    }
  }

  session.reportedValue = finalSteps;
  session.verifiedValue = finalSteps;
  session.status = "completed";
  session.endedAt = new Date();
  await session.save();

  occurrence.status = "completed";
  occurrence.currentResponse = "done";
  await occurrence.save();

  const award = await awardCapsules({
    patient: patient._id,
    organization: context.organization._id,
    program: context.program._id,
    ruleId: "activity_goal",
    sourceType: "DeviceEvidenceSimulation",
    sourceId: occurrence._id,
    actorUserId: user._id,
    actorRole: user.role,
    verificationLevel: "system_confirmed",
    amount: context.program.rules?.activityRewardCapsules || 3,
  });

  const simulatedHashRate = Math.round((12 + finalSteps / 850) * 10) / 10;
  const simulatedHashes = Math.round(simulatedHashRate * durationMinutes * 60);
  const simulatedAcceptedShares = Math.max(1, Math.round(finalSteps / 420));
  const simulatedCoinAmount = Math.round((finalSteps / 5000) * 0.041 * 10000) / 10000;
  const simulatedPriceInr = 4.82;
  const simulatedGrossValueInr =
    Math.round(simulatedCoinAmount * simulatedPriceInr * 100) / 100;

  const mining = await MiningSimulation.findOneAndUpdate(
    { simulationKey: String(session._id) + ":compute-v1" },
    {
      $setOnInsert: {
        activitySession: session._id,
        patient: patient._id,
        organization: context.organization._id,
        program: context.program._id,
        simulatedCoinSymbol: "CDC",
        simulatedHashRate,
        simulatedHashes,
        simulatedAcceptedShares,
        simulatedPowerWatts: 3.7,
        simulatedCoinAmount,
        simulatedPriceInr,
        simulatedGrossValueInr,
        patientShareInr:
          Math.round(simulatedGrossValueInr * 0.6 * 100) / 100,
        hospitalShareInr:
          Math.round(simulatedGrossValueInr * 0.25 * 100) / 100,
        platformShareInr:
          Math.round(simulatedGrossValueInr * 0.15 * 100) / 100,
        isSimulation: true,
      },
    },
    { upsert: true, new: true }
  );

  if (!duplicate) {
    await appendAuditEvent({
    organizationId: context.organization._id,
    programId: context.program._id,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "activity.simulation.completed",
    resourceType: "ActivitySession",
    resourceId: session._id,
    verificationLevel: "system_confirmed",
    metadata: {
      organizationId: String(context.organization._id),
      programId: String(context.program._id),
      isSimulation: true,
      syntheticEvidenceId: String(evidence._id),
      capsuleAwardId: String(award.award?._id || ""),
      occurrenceId: String(occurrence._id),
    },
    });
  }

  return serialize({
    session,
    evidence,
    award: award.award,
    mining,
    duplicate,
  });
}

export async function getLatestActivitySimulation(programId) {
  const { patient } = await requirePatientContext();
  const context = await getProgramForPatient(patient, programId);

  const session = await ActivitySession.findOne({
    patient: patient._id,
    program: context.program._id,
    isSimulation: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!session) return null;

  const [evidence, mining] = await Promise.all([
    DeviceEvidence.findOne({ activitySession: session._id }).lean(),
    MiningSimulation.findOne({ activitySession: session._id }).lean(),
  ]);

  return serialize({ session, evidence, mining });
}
