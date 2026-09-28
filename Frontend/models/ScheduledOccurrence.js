import mongoose from "mongoose";

const ScheduledOccurrenceSchema = new mongoose.Schema(
  {
    occurrenceKey: { type: String, required: true, unique: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalProgram", default: null, index: true },
    carePlan: { type: mongoose.Schema.Types.ObjectId, ref: "CarePlan", required: true, index: true },
    planVersion: { type: mongoose.Schema.Types.ObjectId, ref: "PlanVersion", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    ownerDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    activityKey: { type: String, required: true, index: true },
    activityType: {
      type: String,
      enum: ["lesson", "reminder", "follow_up", "activity", "quiz"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
    safetyText: { type: String, default: "" },
    helpText: { type: String, default: "" },
    activityConfig: {
      goalType: { type: String, enum: ["steps"], default: null },
      goalValue: { type: Number, default: null, min: 250, max: 50000 },
    },
    scheduledFor: { type: Date, required: true, index: true },
    originalScheduledFor: { type: Date, required: true },
    timezone: { type: String, required: true },
    status: {
      type: String,
      enum: ["scheduled", "due", "responded", "completed", "cancelled", "expired"],
      default: "scheduled",
      index: true,
    },
    currentResponse: {
      type: String,
      enum: ["done", "not_done", "need_help", "snooze", null],
      default: null,
    },
    snoozeCount: { type: Number, default: 0, min: 0, max: 20 },
    qstashMessageId: { type: String, default: null },
    deliveryStatus: {
      type: String,
      enum: ["pending", "queued", "sent", "failed", "not_required"],
      default: "pending",
    },
    linkedAppointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    // Set for report-derived missions (lesson/quiz/...) so the dashboard can
    // link back to the exact consultation report a mission came from.
    sourceReport: { type: mongoose.Schema.Types.ObjectId, ref: "DoctorReport", default: null, index: true },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true }
);

ScheduledOccurrenceSchema.index({ organization: 1, patient: 1, scheduledFor: 1, status: 1 });
ScheduledOccurrenceSchema.index({ organization: 1, ownerDoctor: 1, status: 1, scheduledFor: 1 });

export default mongoose.models.ScheduledOccurrence ||
  mongoose.model("ScheduledOccurrence", ScheduledOccurrenceSchema);
