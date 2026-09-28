import mongoose from "mongoose";

const WorkflowFeedbackSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    staffUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    staffRole: {
      type: String,
      enum: ["nurse", "coordinator"],
      required: true,
    },
    duplicateEntryMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 480,
    },
    alertBurden: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    note: { type: String, trim: true, maxlength: 2000, default: "" },
  },
  { timestamps: true }
);

WorkflowFeedbackSchema.index({ organization: 1, createdAt: -1 });

export default mongoose.models.WorkflowFeedback ||
  mongoose.model("WorkflowFeedback", WorkflowFeedbackSchema);
