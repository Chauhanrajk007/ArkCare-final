import mongoose from "mongoose";

const DeviceEvidenceSchema = new mongoose.Schema(
  {
    evidenceKey: { type: String, required: true, unique: true, index: true },
    activitySession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivitySession",
      required: true,
      index: true,
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalProgram", required: true },
    source: {
      type: String,
      enum: ["demo_health_connect", "demo_healthkit", "manual_demo"],
      required: true,
    },
    steps: { type: Number, required: true, min: 0 },
    distanceKm: { type: Number, default: 0, min: 0 },
    durationMinutes: { type: Number, default: 0, min: 0 },
    isSynthetic: { type: Boolean, default: true, immutable: true },
    verificationStatus: {
      type: String,
      enum: ["accepted", "duplicate", "rejected"],
      default: "accepted",
    },
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.DeviceEvidence ||
  mongoose.model("DeviceEvidence", DeviceEvidenceSchema);
