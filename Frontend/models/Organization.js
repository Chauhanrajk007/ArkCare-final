import mongoose from "mongoose";

const OrganizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    demo: { type: Boolean, default: false },
    settings: {
      defaultTimezone: { type: String, default: "Asia/Kolkata" },
      handoffDueMinutes: { type: Number, default: 240, min: 5, max: 10080 },
      simulatedCareBenefitPoolInr: { type: Number, default: 25000, min: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Organization ||
  mongoose.model("Organization", OrganizationSchema);
