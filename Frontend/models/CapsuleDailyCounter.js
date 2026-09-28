import mongoose from "mongoose";

const CapsuleDailyCounterSchema = new mongoose.Schema(
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
    dayKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    awarded: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

CapsuleDailyCounterSchema.index(
  { patient: 1, organization: 1, program: 1, dayKey: 1 },
  { unique: true }
);

export default mongoose.models.CapsuleDailyCounter ||
  mongoose.model("CapsuleDailyCounter", CapsuleDailyCounterSchema);
