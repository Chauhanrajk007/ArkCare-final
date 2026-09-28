import mongoose from "mongoose";

const AuditAnchorBatchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    eventIds: [{ type: String, required: true }],
    merkleRoot: { type: String, required: true },
    privateSalt: { type: String, required: true, select: false },
    eventCount: { type: Number, required: true },
    network: { type: String, default: "carequest-local-evm" },
    chainId: { type: Number, default: 31337 },
    txHash: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed"],
      default: "pending",
    },
    error: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AuditAnchorBatchSchema.index({ organization: 1, createdAt: -1 });

export default mongoose.models.AuditAnchorBatch ||
  mongoose.model("AuditAnchorBatch", AuditAnchorBatchSchema);
