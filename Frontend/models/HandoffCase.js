import mongoose from "mongoose";

const ResolutionSchema = new mongoose.Schema(
  {
    outcome: { type: String, trim: true, maxlength: 3000, default: "" },
    // sha256 over the original request hash + the outcome + who/when. Because
    // the request hash is folded in, a stored resolution provably belongs to
    // the exact problem that was raised — the two cannot be swapped.
    outcomeHash: { type: String, default: "", index: true },
    resolvedByUserId: { type: String, default: "" },
    resolvedByRole: { type: String, default: "" },
    resolvedByName: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
    blockchain: {
      status: {
        type: String,
        enum: ["disabled", "pending", "anchored", "failed"],
        default: "pending",
      },
      batchId: { type: String, default: "" },
      merkleRoot: { type: String, default: "" },
      txHash: { type: String, default: "" },
      blockNumber: { type: Number, default: null },
      anchoredAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
  },
  { _id: false }
);

const HandoffCaseSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },

    // Direct "Need Help" requests are not tied to a specific mission, so these
    // become optional. Mission-triggered handoffs still populate them.
    carePlan: { type: mongoose.Schema.Types.ObjectId, ref: "CarePlan", default: null, index: true },
    planVersion: { type: mongoose.Schema.Types.ObjectId, ref: "PlanVersion", default: null },
    occurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduledOccurrence",
      default: null,
      index: true,
    },

    // How this handoff was raised.
    source: {
      type: String,
      enum: ["mission", "direct_help", "report", "escalation"],
      default: "mission",
      index: true,
    },

    // Who raised the need (patient via direct help, or a mission response).
    requestedByUserId: { type: String, default: "" },
    requestedByRole: { type: String, default: "" },

    priority: { type: String, enum: ["low", "normal", "high"], default: "normal", index: true },
    assignedRole: {
      type: String,
      enum: ["nurse", "coordinator", "doctor"],
      default: "coordinator",
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    team: { type: String, default: "CareQuest Demo Team" },
    dueAt: { type: Date, required: true, index: true },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["open", "assigned", "contacted", "escalated", "resolved"],
      default: "open",
      index: true,
    },
    lastContactSuccessful: { type: Boolean, default: null },
    outcome: { type: String, trim: true, maxlength: 3000, default: "" },
    resolvedAt: { type: Date, default: null },

    // Tamper-evident commitment to the problem text, hashed and anchored
    // on-chain at creation.
    requestHash: { type: String, default: "", index: true },
    requestBlockchain: {
      status: {
        type: String,
        enum: ["disabled", "pending", "anchored", "failed"],
        default: "pending",
      },
      batchId: { type: String, default: "" },
      merkleRoot: { type: String, default: "" },
      txHash: { type: String, default: "" },
      blockNumber: { type: Number, default: null },
      anchoredAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },

    // Resolved outcome, chained to requestHash and stored as "work done".
    resolution: { type: ResolutionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

HandoffCaseSchema.index({ organization: 1, status: 1, dueAt: 1 });
HandoffCaseSchema.index({ organization: 1, source: 1, createdAt: -1 });

export default mongoose.models.HandoffCase ||
  mongoose.model("HandoffCase", HandoffCaseSchema);
