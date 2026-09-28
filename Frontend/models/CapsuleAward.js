import mongoose from "mongoose";

const CapsuleAwardSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalProgram", default: null, index: true },
    ruleId: { type: String, required: true, index: true },
    ruleVersion: { type: Number, required: true, default: 1 },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    verificationLevel: {
      type: String,
      enum: ["self_report", "system_confirmed", "staff_documented", "clinician_approved"],
      required: true,
    },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    eventType: {
      type: String,
      enum: ["award", "reversal", "redemption"],
      default: "award",
    },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "CapsuleAward", default: null },
    blockchain: {
      status: {
        type: String,
        enum: ["pending", "synced", "failed", "disabled"],
        default: "pending",
      },
      txHash: { type: String, default: null },
      syncedAt: { type: Date, default: null },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CapsuleAwardSchema.index({ patient: 1, organization: 1, program: 1, createdAt: -1 });

export default mongoose.models.CapsuleAward ||
  mongoose.model("CapsuleAward", CapsuleAwardSchema);
