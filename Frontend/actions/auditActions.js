"use server";

import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import AuditEvent from "@/models/AuditEvent";
import AuditAnchorBatch from "@/models/AuditAnchorBatch";
import { buildMerkleRoot, verifyAuditChain } from "@/lib/carequest/audit";
import { anchorAuditRoot, blockchainHealth } from "@/lib/carequest/blockchain";
import { requireStaffMembership } from "@/lib/carequest/permissions";

async function requireAuditMembership(user) {
  if (user.role !== "hospital_admin") {
    throw new Error("Hospital admin audit access required");
  }
  return requireStaffMembership(user, ["hospital_admin"]);
}

export async function getAuditOverview() {
  const user = await requireUser();
  await connectDB();
  const membership = await requireAuditMembership(user);
  const organizationId = membership.organization._id;

  const [events, batches, verification, chain, legacyUnscopedExists] =
    await Promise.all([
      AuditEvent.find({
        organization: organizationId,
        schemaVersion: 2,
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      AuditAnchorBatch.find({ organization: organizationId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      verifyAuditChain({ organizationId }),
      blockchainHealth(),
      AuditEvent.exists({
        $or: [
          { organization: null },
          { organization: { $exists: false } },
        ],
      }),
    ]);

  return JSON.parse(
    JSON.stringify({
      organization: membership.organization,
      events,
      batches,
      verification,
      blockchain: chain,
      legacyUnscopedExcluded: Boolean(legacyUnscopedExists),
    })
  );
}

export async function anchorPendingAuditEvents() {
  const user = await requireUser();
  if (user.role !== "hospital_admin") {
    throw new Error("Hospital admin access required");
  }

  await connectDB();
  const membership = await requireStaffMembership(user, ["hospital_admin"]);
  const organizationId = membership.organization._id;

  const existing = await AuditAnchorBatch.find({
    organization: organizationId,
  })
    .select("eventIds")
    .lean();
  const anchored = new Set(
    existing.flatMap((batch) => batch.eventIds || [])
  );

  const events = (
    await AuditEvent.find({
      organization: organizationId,
      schemaVersion: 2,
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(500)
      .lean()
  )
    .filter((event) => !anchored.has(event.eventId))
    .slice(0, 100);

  if (!events.length) {
    return {
      success: true,
      message: "No unanchored events for this hospital",
    };
  }

  const batchId = crypto.randomUUID();
  const privateSalt = crypto.randomBytes(32).toString("hex");
  const merkleRoot = buildMerkleRoot(
    events.map((event) => event.eventHash),
    privateSalt
  );

  const batch = await AuditAnchorBatch.create({
    batchId,
    organization: organizationId,
    eventIds: events.map((event) => event.eventId),
    merkleRoot,
    eventCount: events.length,
    privateSalt,
    status: "pending",
  });

  try {
    const result = await anchorAuditRoot({ batchId, merkleRoot });
    if (result.disabled) {
      batch.status = "pending";
      batch.error = "Blockchain disabled; batch prepared locally";
    } else {
      batch.status = "confirmed";
      batch.txHash = result.txHash || null;
      batch.network = result.network || "carequest-local-evm";
      batch.chainId = result.chainId || 31337;
      batch.confirmedAt = new Date();
    }
  } catch (error) {
    batch.status = "failed";
    batch.error = error.message;
  }

  await batch.save();
  return JSON.parse(JSON.stringify(batch));
}
