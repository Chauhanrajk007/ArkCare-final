import mongoose from "mongoose";

const CaseEventSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "HandoffCase", required: true, index: true },
    eventType: {
      type: String,
      enum: [
        "case.created",
        "case.help_requested",
        "case.assigned",
        "case.reassigned",
        "contact.attempted",
        "contact.successful",
        "contact.unsuccessful",
        "case.escalated",
        "case.resolved",
        "case.resolution_anchored",
      ],
      required: true,
      index: true,
    },
    actorUserId: { type: String, required: true },
    actorRole: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 3000, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.CaseEvent ||
  mongoose.model("CaseEvent", CaseEventSchema);
