import mongoose from "mongoose";

const RewardBudgetSchema = new mongoose.Schema(
  {
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
      unique: true,
      index: true,
    },
    currency: { type: String, default: "INR" },
    fundedAmount: { type: Number, required: true, min: 0 },
    reservedAmount: { type: Number, default: 0, min: 0 },
    spentAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "paused", "exhausted"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.RewardBudget ||
  mongoose.model("RewardBudget", RewardBudgetSchema);
