import mongoose from "mongoose";

const PatientSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // users collection _id
  name: { type: String, required: true },
  email: { type: String, required: true },
  gender: { type: String, enum: ["male", "female", "other"], default: "other" }, // mirrors User.gender
  patientDescription: { type: String },
  lab_json: { type: String }, // JSON string of patient's details (dob, health info, answers to onboarding qs, etc.)
}, { timestamps: true });

export default mongoose.models.Patient || mongoose.model("Patient", PatientSchema);
