import mongoose from "mongoose";

const RewardCatalogItemSchema = new mongoose.Schema(
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
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    category: {
      type: String,
      enum: ["education", "accessibility", "travel", "follow_up_support", "wellness"],
      default: "wellness",
    },
    costCapsules: { type: Number, required: true, min: 1 },
    programCostInr: { type: Number, required: true, min: 0 },
    inventoryLimit: { type: Number, default: null, min: 1 },
    redeemedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

RewardCatalogItemSchema.index({ program: 1, active: 1 });

export default mongoose.models.RewardCatalogItem ||
  mongoose.model("RewardCatalogItem", RewardCatalogItemSchema);
