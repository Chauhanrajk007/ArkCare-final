import mongoose from "mongoose";

const DoctorSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // users collection _id
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  specialization: { type: String, required: true },
  category: { type: String, required: true }, // e.g. cardiology, dermatology, pediatrics
  experience: { type: Number },
  qualifications: [String],
  consultationFee: { type: Number },
  availability: [
    {
      day: { type: String }, // e.g. Monday
      slots: [String], // e.g. ["10:00", "11:30"]
    }
  ],
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }, // controlled by admin
}, { timestamps: true });

export default mongoose.models.Doctor || mongoose.model("Doctor", DoctorSchema);
