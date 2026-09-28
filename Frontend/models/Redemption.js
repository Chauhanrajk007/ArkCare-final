import mongoose from "mongoose";

const RedemptionSchema = new mongoose.Schema(
  {
    redemptionKey: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
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
    catalogItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardCatalogItem",
      required: true,
    },
    capsulesSpent: { type: Number, required: true, min: 1 },
    programCostInr: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["confirmed", "reversed"],
      default: "confirmed",
      index: true,
    },
    redeemedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Redemption ||
  mongoose.model("Redemption", RedemptionSchema);
