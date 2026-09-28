import mongoose from "mongoose";

const CarePlanSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HospitalProgram",
      default: null,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    ownerDoctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    sourceAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    currentVersion: { type: Number, min: 0, default: 0 },
    currentApprovedVersion: { type: Number, min: 1, default: null },
    createdByUserId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

CarePlanSchema.index({ organization: 1, patient: 1, ownerDoctor: 1, status: 1 });

export default mongoose.models.CarePlan ||
  mongoose.model("CarePlan", CarePlanSchema);
