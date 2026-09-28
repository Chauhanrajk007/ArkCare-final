import mongoose from "mongoose";

const HospitalProgramSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    slug: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    capsuleName: { type: String, required: true, trim: true, default: "Care Capsule" },
    capsuleSymbol: { type: String, required: true, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "closed"],
      default: "active",
      index: true,
    },
    visualTheme: {
      accent: { type: String, default: "sage" },
      mascot: { type: String, default: "guide" },
    },
    rules: {
      dailyAwardCap: { type: Number, default: 12, min: 1, max: 500 },
      activityGoalSteps: { type: Number, default: 5000, min: 250, max: 50000 },
      activityRewardCapsules: { type: Number, default: 3, min: 1, max: 100 },
    },
    blockchain: {
      enabled: { type: Boolean, default: false },
      tokenId: { type: String, default: null },
    },
  },
  { timestamps: true }
);

HospitalProgramSchema.index({ organization: 1, slug: 1 }, { unique: true });

export default mongoose.models.HospitalProgram ||
  mongoose.model("HospitalProgram", HospitalProgramSchema);
