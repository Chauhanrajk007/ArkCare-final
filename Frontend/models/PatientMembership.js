import mongoose from "mongoose";

const PatientMembershipSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HospitalProgram",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "left"],
      default: "active",
      index: true,
    },
    consents: {
      rewards: { type: Boolean, default: true },
      simulatedActivityData: { type: Boolean, default: false },
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PatientMembershipSchema.index(
  { patient: 1, organization: 1, program: 1 },
  { unique: true }
);

export default mongoose.models.PatientMembership ||
  mongoose.model("PatientMembership", PatientMembershipSchema);
