import mongoose from "mongoose";

const PatientResponseSchema = new mongoose.Schema(
  {
    responseKey: { type: String, required: true, unique: true, index: true },
    occurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduledOccurrence",
      required: true,
      index: true,
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    response: {
      type: String,
      enum: ["done", "not_done", "need_help", "snooze", "lesson_completed"],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 2000, default: "" },
    verificationLevel: {
      type: String,
      enum: ["self_report", "system_confirmed", "staff_documented", "clinician_approved"],
      required: true,
    },
    reportedAt: { type: Date, default: Date.now, immutable: true },
    snoozedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

PatientResponseSchema.index({ occurrence: 1, reportedAt: -1 });

export default mongoose.models.PatientResponse ||
  mongoose.model("PatientResponse", PatientResponseSchema);
