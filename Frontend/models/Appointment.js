import mongoose from "mongoose";

const AppointmentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalProgram", default: null, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
  appointmentDate: { type: Date, required: true, index: true },
  reason: { type: String, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ["pending", "confirmed", "completed", "cancelled"],
    default: "pending",
    index: true,
  },
  notes: { type: String, trim: true, maxlength: 4000 },
  slotKey: { type: String, unique: true, sparse: true },
  holdExpiresAt: { type: Date, default: null, index: true },
  paymentId: { type: String, index: true, sparse: true, unique: true },
  paymentOrderId: { type: String, index: true, sparse: true, unique: true },
  amount: { type: Number, min: 0 },
  currency: { type: String, default: "INR" },
  cancelledAt: { type: Date, default: null, index: true },
  cancelledByRole: {
    type: String,
    enum: ["patient", "doctor", "system", null],
    default: null,
  },
  cancellationReason: { type: String, default: "", trim: true, maxlength: 1000 },
}, { timestamps: true });

AppointmentSchema.index({ organization: 1, doctor: 1, appointmentDate: 1, status: 1 });

export default mongoose.models.Appointment || mongoose.model("Appointment", AppointmentSchema);
