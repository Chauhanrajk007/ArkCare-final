import crypto from "node:crypto";
import mongoose from "mongoose";
import AuditEvent from "@/models/AuditEvent";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.isValidObjectId(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function v1Canonical(event) {
  return JSON.stringify(
    stable({
      eventId: event.eventId,
      eventType: event.eventType,
      actorUserId: String(event.actorUserId),
      actorRole: String(event.actorRole),
      resourceType: event.resourceType,
      resourceId: String(event.resourceId),
      verificationLevel: event.verificationLevel,
      metadata: event.metadata || {},
      previousHash: event.previousHash || "",
    })
  );
}

function v2Canonical(event) {
  return JSON.stringify(
    stable({
      schemaVersion: 2,
      organizationId: String(event.organization || ""),
      programId: String(event.program || ""),
      eventId: event.eventId,
      eventType: event.eventType,
      actorUserId: String(event.actorUserId),
      actorRole: String(event.actorRole),
      resourceType: event.resourceType,
      resourceId: String(event.resourceId),
      verificationLevel: event.verificationLevel,
      metadata: event.metadata || {},
      previousHash: event.previousHash || "",
    })
  );
}

export async function appendAuditEvent({
  organizationId = null,
  programId = null,
  actorUserId,
  actorRole,
  eventType,
  resourceType,
  resourceId,
  verificationLevel = "system_confirmed",
  metadata = {},
}) {
  const organization =
    objectIdOrNull(organizationId) ||
    objectIdOrNull(metadata?.organizationId);
  const program =
    objectIdOrNull(programId) ||
    objectIdOrNull(metadata?.programId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const eventId = crypto.randomUUID();
    const previous = await AuditEvent.findOne({
      organization: organization || null,
      schemaVersion: 2,
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const previousHash = previous?.eventHash || "";
    const candidate = {
      schemaVersion: 2,
      organization,
      program,
      eventId,
      eventType,
      actorUserId: String(actorUserId),
      actorRole: String(actorRole),
      resourceType,
      resourceId: String(resourceId),
      verificationLevel,
      metadata,
      previousHash,
    };
    const eventHash = digest(v2Canonical(candidate));

    try {
      return await AuditEvent.create({
        ...candidate,
        eventHash,
      });
    } catch (error) {
      // A concurrent writer may have used the same organization chain head.
      // The partial unique index on {organization, previousHash} forces one
      // writer to retry from the newly committed head instead of creating a fork.
      if (error?.code === 11000 && attempt < 4) continue;
      throw error;
    }
  }

  throw new Error("Could not append audit event after chain-head retries");
}

export async function verifyAuditChain({
  organizationId = null,
  limit = 500,
  includeLegacy = false,
} = {}) {
  const organization = objectIdOrNull(organizationId);
  const query = organization
    ? { organization, schemaVersion: 2 }
    : includeLegacy
      ? {}
      : { organization: null, schemaVersion: 2 };

  const events = await AuditEvent.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .lean();

  let expectedPrevious = "";
  const errors = [];

  for (const event of events) {
    if (event.previousHash !== expectedPrevious) {
      errors.push({
        eventId: event.eventId,
        reason: "previous_hash_mismatch",
      });
    }

    const canonical =
      event.schemaVersion === 2 ? v2Canonical(event) : v1Canonical(event);
    const recalculated = digest(canonical);
    if (recalculated !== event.eventHash) {
      errors.push({
        eventId: event.eventId,
        reason: "event_hash_mismatch",
      });
    }

    expectedPrevious = event.eventHash;
  }

  return {
    checked: events.length,
    valid: errors.length === 0,
    errors,
    headHash: expectedPrevious,
    organizationId: organization ? String(organization) : null,
  };
}

export function buildMerkleRoot(eventHashes, privateSalt) {
  if (!eventHashes.length) {
    throw new Error("Cannot anchor an empty audit batch");
  }

  let layer = eventHashes.map((hash) => digest(privateSalt + ":" + hash));

  while (layer.length > 1) {
    const next = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1] || left;
      next.push(digest(left + right));
    }
    layer = next;
  }

  return "0x" + layer[0];
}
