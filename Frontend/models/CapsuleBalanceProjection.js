import mongoose from "mongoose";

const CapsuleBalanceProjectionSchema = new mongoose.Schema(
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
    balance: { type: Number, required: true, default: 0 },
    lifetimeEarned: { type: Number, required: true, default: 0, min: 0 },
    lifetimeRedeemed: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

CapsuleBalanceProjectionSchema.index(
  { patient: 1, organization: 1, program: 1 },
  { unique: true }
);

export default mongoose.models.CapsuleBalanceProjection ||
  mongoose.model("CapsuleBalanceProjection", CapsuleBalanceProjectionSchema);
