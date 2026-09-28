import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.Chat || mongoose.model("Chat", ChatSchema);
