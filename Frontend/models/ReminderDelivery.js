import mongoose from "mongoose";

const ReminderDeliverySchema = new mongoose.Schema(
  {
    deliveryKey: { type: String, required: true, unique: true, index: true },
    occurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduledOccurrence",
      required: true,
      index: true,
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    channel: { type: String, enum: ["in_app", "email", "push"], default: "in_app" },
    status: { type: String, enum: ["queued", "sent", "failed"], default: "queued", index: true },
    attempts: { type: Number, default: 0 },
    providerMessageId: { type: String, default: null },
    failureCode: { type: String, default: "" },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.ReminderDelivery ||
  mongoose.model("ReminderDelivery", ReminderDeliverySchema);
