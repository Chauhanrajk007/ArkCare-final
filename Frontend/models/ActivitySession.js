import mongoose from "mongoose";

const ActivitySessionSchema = new mongoose.Schema(
  {
    sessionKey: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HospitalProgram",
      required: true,
      index: true,
    },
    missionOccurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduledOccurrence",
      default: null,
      index: true,
    },
    goalType: { type: String, enum: ["steps"], default: "steps" },
    goalValue: { type: Number, required: true, min: 250 },
    status: {
      type: String,
      enum: ["ready", "active", "paused", "submitted", "verified", "rejected", "completed"],
      default: "ready",
      index: true,
    },
    deviceSource: {
      type: String,
      enum: ["demo_health_connect", "demo_healthkit", "manual_demo"],
      default: "demo_health_connect",
    },
    reportedValue: { type: Number, default: 0, min: 0 },
    verifiedValue: { type: Number, default: 0, min: 0 },
    isSimulation: { type: Boolean, default: true, immutable: true },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ActivitySessionSchema.index({ patient: 1, program: 1, createdAt: -1 });

export default mongoose.models.ActivitySession ||
  mongoose.model("ActivitySession", ActivitySessionSchema);
