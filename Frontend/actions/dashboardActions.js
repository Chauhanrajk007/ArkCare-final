"use server";

import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import ReminderDelivery from "@/models/ReminderDelivery";
import HandoffCase from "@/models/HandoffCase";
import CaseEvent from "@/models/CaseEvent";
import CapsuleAward from "@/models/CapsuleAward";
import UserPreference from "@/models/UserPreference";
import WorkflowFeedback from "@/models/WorkflowFeedback";
import HospitalProgram from "@/models/HospitalProgram";
import PatientMembership from "@/models/PatientMembership";
import RewardBudget from "@/models/RewardBudget";
import Redemption from "@/models/Redemption";
import MiningSimulation from "@/models/MiningSimulation";
import PaymentEvidence from "@/models/PaymentEvidence";
import { requireStaffMembership } from "@/lib/carequest/permissions";
import { ensureDemoHospitalPrograms } from "@/lib/carequest/programs";

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

export async function getServiceImprovementDashboard() {
  const user = await requireUser();
  if (user.role !== "hospital_admin") {
    throw new Error("Hospital admin access required");
  }

  await connectDB();
  await ensureDemoHospitalPrograms();
  const membership = await requireStaffMembership(user, ["hospital_admin"]);
  const organizationId = membership.organization._id;

  const [
    programs,
    occurrences,
    cases,
    workflowFeedback,
    memberships,
    capsuleAwards,
    budgets,
    redemptions,
    miningRuns,
    paymentEvidence,
  ] = await Promise.all([
    HospitalProgram.find({ organization: organizationId, status: { $ne: "closed" } }).lean(),
    ScheduledOccurrence.find({
      organization: organizationId,
      status: { $ne: "cancelled" },
    })
      .populate("linkedAppointment", "status amount paymentId")
      .lean(),
    HandoffCase.find({ organization: organizationId }).lean(),
    WorkflowFeedback.find({ organization: organizationId }).lean(),
    PatientMembership.find({ organization: organizationId })
      .populate("patient", "userId")
      .lean(),
    CapsuleAward.find({ organization: organizationId }).lean(),
    RewardBudget.find({ organization: organizationId }).lean(),
    Redemption.find({ organization: organizationId, status: "confirmed" }).lean(),
    MiningSimulation.find({ organization: organizationId, isSimulation: true }).lean(),
    PaymentEvidence.find({
      organization: organizationId,
    }).lean(),
  ]);

  const occurrenceIds = occurrences.map((item) => item._id);
  const caseIds = cases.map((item) => item._id);
  const memberUserIds = memberships
    .map((item) => item.patient?.userId)
    .filter(Boolean);

  const [deliveries, contactEvents, optOutPreferences] = await Promise.all([
    occurrenceIds.length
      ? ReminderDelivery.find({ occurrence: { $in: occurrenceIds } }).lean()
      : [],
    caseIds.length
      ? CaseEvent.find({
          caseId: { $in: caseIds },
          eventType: {
            $in: [
              "contact.successful",
              "contact.unsuccessful",
              "case.reassigned",
            ],
          },
        }).lean()
      : [],
    memberUserIds.length
      ? UserPreference.find({
          userId: { $in: memberUserIds },
          careQuestOptIn: false,
        }).lean()
      : [],
  ]);

  const respondedOccurrences = occurrences.filter((item) =>
    ["responded", "completed"].includes(item.status)
  ).length;
  const delivered = deliveries.filter((item) => item.status === "sent").length;
  const failedDeliveries = deliveries.filter((item) => item.status === "failed").length;
  const followups = occurrences.filter((item) => item.activityType === "follow_up");
  const bookedFollowups = followups.filter((item) => item.linkedAppointment).length;
  const completedFollowups = followups.filter(
    (item) => item.linkedAppointment?.status === "completed"
  ).length;

  const openCases = cases.filter((item) => item.status !== "resolved");
  const unowned = openCases.filter((item) => !item.assignedTo).length;
  const overdue = openCases.filter((item) => new Date(item.dueAt) < new Date()).length;
  const resolutionMinutes = cases
    .filter((item) => item.resolvedAt)
    .map((item) => (new Date(item.resolvedAt) - new Date(item.createdAt)) / 60000);
  const unsuccessfulContacts = contactEvents.filter(
    (item) => item.eventType === "contact.unsuccessful"
  ).length;
  const reassignments = contactEvents.filter(
    (item) => item.eventType === "case.reassigned"
  ).length;

  const duplicateEntryMinutes = sum(workflowFeedback, "duplicateEntryMinutes");
  const averageAlertBurden = workflowFeedback.length
    ? Math.round(
        (sum(workflowFeedback, "alertBurden") / workflowFeedback.length) * 10
      ) / 10
    : 0;

  const positiveAwards = capsuleAwards.filter(
    (item) => item.eventType === "award" && Number(item.amount) > 0
  );
  const redemptionAwards = capsuleAwards.filter(
    (item) => item.eventType === "redemption"
  );
  const capsulesIssued = sum(positiveAwards, "amount");
  const capsulesRedeemed = Math.abs(sum(redemptionAwards, "amount"));

  const fundedBudgetInr = sum(budgets, "fundedAmount");
  const spentBudgetInr = sum(budgets, "spentAmount");
  const remainingBudgetInr = Math.max(0, fundedBudgetInr - spentBudgetInr);

  const paidEvidence = paymentEvidence.filter(
    (item) => item.status !== "demo" && Number(item.grossAmount) > 0
  );
  const recordedPaidInr = sum(paidEvidence, "netPaidAmount");
  const recordedRefundInr = sum(paidEvidence, "refundAmount");

  const simulatedGrossValueInr = sum(miningRuns, "simulatedGrossValueInr");
  const simulatedPatientShareInr = sum(miningRuns, "patientShareInr");
  const simulatedHospitalShareInr = sum(miningRuns, "hospitalShareInr");
  const simulatedPlatformShareInr = sum(miningRuns, "platformShareInr");

  const programSummaries = programs.map((program) => {
    const programAwards = capsuleAwards.filter(
      (item) => String(item.program) === String(program._id)
    );
    const budget = budgets.find(
      (item) => String(item.program) === String(program._id)
    );
    const programRedemptions = redemptions.filter(
      (item) => String(item.program) === String(program._id)
    );
    return {
      ...program,
      capsulesIssued: sum(
        programAwards.filter(
          (item) => item.eventType === "award" && Number(item.amount) > 0
        ),
        "amount"
      ),
      capsulesRedeemed: Math.abs(
        sum(
          programAwards.filter((item) => item.eventType === "redemption"),
          "amount"
        )
      ),
      redemptionCount: programRedemptions.length,
      fundedBudgetInr: Number(budget?.fundedAmount || 0),
      spentBudgetInr: Number(budget?.spentAmount || 0),
      remainingBudgetInr: Math.max(
        0,
        Number(budget?.fundedAmount || 0) - Number(budget?.spentAmount || 0)
      ),
    };
  });

  return JSON.parse(
    JSON.stringify({
      organization: membership.organization,
      programs: programSummaries,
      definitions: {
        responseRate:
          "responded/completed hospital-scoped occurrences ÷ non-cancelled hospital-scoped occurrences",
        recordedFinance:
          "appointments with an authorized paymentId and stored paid amount; simulated mining is excluded",
        simulatedCompute:
          "virtual demo-only device/mining/market records; not payment, token market value or hospital revenue",
      },
      metrics: {
        enrolledPatients: memberships.filter((item) => item.status === "active").length,
        totalOccurrences: occurrences.length,
        respondedOccurrences,
        responseRate: occurrences.length
          ? Math.round((respondedOccurrences / occurrences.length) * 1000) / 10
          : 0,
        delivered,
        failedDeliveries,
        bookedFollowups,
        completedFollowups,
        openCases: openCases.length,
        unowned,
        overdue,
        resolvedCases: cases.filter((item) => item.status === "resolved").length,
        medianResolutionMinutes: Math.round(median(resolutionMinutes)),
        optOuts: optOutPreferences.length,
        alertVolume: cases.length,
        unsuccessfulContacts,
        reassignments,
        staffFeedbackCount: workflowFeedback.length,
        duplicateEntryMinutes,
        averageAlertBurden,
      },
      rewards: {
        capsulesIssued,
        capsulesRedeemed,
        redemptionCount: redemptions.length,
        fundedBudgetInr,
        spentBudgetInr,
        remainingBudgetInr,
      },
      finance: {
        recordedPaidConsultations: paidEvidence.length,
        recordedPaidInr,
        refundsRecordedInCareQuest: paidEvidence.filter(
          (item) => Number(item.refundAmount) > 0
        ).length,
        recordedRefundInr,
        demoAppointmentsExcluded: paymentEvidence.filter(
          (item) => item.status === "demo"
        ).length,
        note:
          "Only PaymentEvidence records enter this section. Demo bookings and simulated compute values are excluded.",
      },
      simulation: {
        simulated: true,
        sessionCount: miningRuns.length,
        simulatedGrossValueInr,
        simulatedPatientShareInr,
        simulatedHospitalShareInr,
        simulatedPlatformShareInr,
      },
    })
  );
}
