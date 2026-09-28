import mongoose from "mongoose";

const AuditEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
    },
    schemaVersion: {
      type: Number,
      enum: [1, 2],
      default: 2,
      immutable: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      immutable: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HospitalProgram",
      default: null,
      immutable: true,
      index: true,
    },
    eventType: { type: String, required: true, index: true, immutable: true },
    actorUserId: { type: String, required: true, immutable: true },
    actorRole: { type: String, required: true, immutable: true },
    resourceType: { type: String, required: true, immutable: true },
    resourceId: { type: String, required: true, index: true, immutable: true },
    verificationLevel: {
      type: String,
      enum: [
        "self_report",
        "system_confirmed",
        "staff_documented",
        "clinician_approved",
      ],
      required: true,
      immutable: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      immutable: true,
    },
    previousHash: { type: String, default: "", immutable: true },
    eventHash: { type: String, required: true, index: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditEventSchema.index({ organization: 1, createdAt: 1, _id: 1 });
AuditEventSchema.index(
  { organization: 1, previousHash: 1 },
  {
    unique: true,
    partialFilterExpression: { schemaVersion: 2 },
  }
);

for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "deleteOne",
  "deleteMany",
]) {
  AuditEventSchema.pre(operation, function () {
    throw new Error("Audit events are append-only");
  });
}

export default mongoose.models.AuditEvent ||
  mongoose.model("AuditEvent", AuditEventSchema);
