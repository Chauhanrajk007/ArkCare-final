import crypto from "node:crypto";
import HandoffCase from "@/models/HandoffCase";
import CaseEvent from "@/models/CaseEvent";
import Organization from "@/models/Organization";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { anchorAuditRoot, blockchainEnabled } from "@/lib/carequest/blockchain";
import { getOrCreateDemoOrganization } from "@/lib/carequest/permissions";
import { emitCareQuestStaff } from "@/lib/carequest/realtime";

function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Canonical hash of a need-help request. Committed on-chain so the exact
 * problem the patient raised is provable and cannot be silently rewritten.
 */
export function computeRequestHash({ problem, category }) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        problem: clean(problem, 2000),
        category: clean(category, 60),
      })
    )
    .digest("hex");
}

/**
 * Resolution hash = H(requestHash + outcome + resolver + timestamp). Folding
 * in the request hash binds the recorded resolution to the exact problem it
 * answers, so a stored outcome cannot be re-attached to a different request.
 */
export function computeResolutionHash({ requestHash, outcome, resolvedBy, at }) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        requestHash: String(requestHash || ""),
        outcome: clean(outcome, 3000),
        resolvedBy: String(resolvedBy || ""),
        at: new Date(at).toISOString(),
      })
    )
    .digest("hex");
}

async function anchorToChain({ batchId, hash, caseId, organization, actorUserId, actorRole, eventType }) {
  if (!blockchainEnabled()) {
    return { status: "disabled", batchId, merkleRoot: "0x" + hash };
  }
  try {
    const result = await anchorAuditRoot({ batchId, merkleRoot: "0x" + hash });
    await appendAuditEvent({
      organizationId: organization,
      actorUserId,
      actorRole,
      eventType,
      resourceType: "HandoffCase",
      resourceId: caseId,
      verificationLevel: "system_confirmed",
      metadata: {
        batchId,
        merkleRoot: "0x" + hash,
        txHash: result.txHash || "",
        blockNumber: result.blockNumber ?? null,
        network: result.network || "carequest-local-evm",
      },
    });
    return {
      status: "anchored",
      batchId,
      merkleRoot: "0x" + hash,
      txHash: result.txHash || "",
      blockNumber: result.blockNumber ?? null,
      anchoredAt: new Date(),
    };
  } catch (error) {
    return { status: "failed", batchId, merkleRoot: "0x" + hash, error: clean(error?.message, 200) };
  }
}

/**
 * Raise a direct "Need Help" request from the floating button. Not tied to a
 * mission: the patient (or doctor) simply types the problem. It lands in the
 * nurse/coordinator queue and, once escalated, in the doctor's queue.
 */
export async function createDirectHelpRequest({
  user,
  patient,
  problem,
  category = "general",
  priority = "normal",
}) {
  const cleanProblem = clean(problem, 2000);
  if (cleanProblem.length < 4) {
    throw new Error("Please describe the problem you need help with");
  }

  const organization = await getOrCreateDemoOrganization();
  const requestHash = computeRequestHash({ problem: cleanProblem, category });
  const dueAt = new Date(Date.now() + (organization.settings?.handoffDueMinutes || 240) * 60 * 1000);

  // Each raise is its own case (no dedupe collapse), so the patient can track
  // each request to its own resolution.
  const dedupeKey = "help:" + crypto.randomUUID();

  const handoff = await HandoffCase.create({
    dedupeKey,
    organization: organization._id,
    patient: patient._id,
    source: "direct_help",
    requestedByUserId: user._id.toString(),
    requestedByRole: user.role,
    priority,
    assignedRole: "coordinator",
    dueAt,
    summary: cleanProblem,
    requestHash,
    requestBlockchain: { status: blockchainEnabled() ? "pending" : "disabled" },
  });

  await CaseEvent.create({
    caseId: handoff._id,
    eventType: "case.help_requested",
    actorUserId: user._id.toString(),
    actorRole: user.role,
    note: cleanProblem,
  });

  await appendAuditEvent({
    organizationId: organization._id,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "handoff.help_requested",
    resourceType: "HandoffCase",
    resourceId: handoff._id,
    verificationLevel: "self_report",
    metadata: {
      organizationId: String(organization._id),
      source: "direct_help",
      priority,
      category,
      requestHash,
    },
  });

  // Anchor the request text so the raised problem is provable.
  const chain = await anchorToChain({
    batchId: "handoff:" + String(handoff._id) + ":request",
    hash: requestHash,
    caseId: handoff._id,
    organization: organization._id,
    actorUserId: user._id,
    actorRole: user.role,
    eventType: "handoff.request.anchored",
  });
  handoff.requestBlockchain = {
    ...handoff.requestBlockchain,
    ...chain,
  };
  await handoff.save();

  await emitCareQuestStaff(organization._id, "handoff.updated", {
    caseId: String(handoff._id),
    status: handoff.status,
    source: "direct_help",
  });

  return handoff;
}

/**
 * Resolve a handoff. The outcome is hashed together with the request hash,
 * anchored on-chain (tamper-evident, linked to the original problem), stored as
 * the case's resolution ("work done"), and audited.
 */
export async function resolveHandoffWithProof({
  handoff,
  actorUserId,
  actorRole,
  actorName,
  outcome,
}) {
  const cleanOutcome = clean(outcome, 3000);
  if (!cleanOutcome) {
    throw new Error("A case cannot close without a documented outcome or reason");
  }

  const resolvedAt = new Date();
  const outcomeHash = computeResolutionHash({
    requestHash: handoff.requestHash,
    outcome: cleanOutcome,
    resolvedBy: actorUserId,
    at: resolvedAt,
  });

  handoff.status = "resolved";
  handoff.outcome = cleanOutcome;
  handoff.resolvedAt = resolvedAt;
  handoff.resolution = {
    outcome: cleanOutcome,
    outcomeHash,
    resolvedByUserId: String(actorUserId || ""),
    resolvedByRole: actorRole,
    resolvedByName: clean(actorName, 120),
    resolvedAt,
    blockchain: { status: blockchainEnabled() ? "pending" : "disabled" },
  };
  await handoff.save();

  await CaseEvent.create({
    caseId: handoff._id,
    eventType: "case.resolved",
    actorUserId: String(actorUserId || ""),
    actorRole,
    note: cleanOutcome,
  });

  await appendAuditEvent({
    organizationId: handoff.organization,
    actorUserId,
    actorRole,
    eventType: "handoff.resolved",
    resourceType: "HandoffCase",
    resourceId: handoff._id,
    verificationLevel: actorRole === "doctor" ? "clinician_approved" : "staff_documented",
    metadata: {
      organizationId: String(handoff.organization || ""),
      requestHash: handoff.requestHash || "",
      outcomeHash,
      workDoneRecorded: true,
      linkedToRequest: Boolean(handoff.requestHash),
    },
  });

  // Anchor the resolution, chained to the request hash.
  const chain = await anchorToChain({
    batchId: "handoff:" + String(handoff._id) + ":resolution",
    hash: outcomeHash,
    caseId: handoff._id,
    organization: handoff.organization,
    actorUserId,
    actorRole,
    eventType: "handoff.resolution.anchored",
  });
  handoff.resolution.blockchain = { ...handoff.resolution.blockchain, ...chain };
  await handoff.save();

  await emitCareQuestStaff(handoff.organization, "handoff.updated", {
    caseId: String(handoff._id),
    status: handoff.status,
  });

  return handoff;
}
