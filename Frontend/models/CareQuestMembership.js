import mongoose from "mongoose";

const CareQuestMembershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["doctor", "nurse", "coordinator", "hospital_admin"],
      required: true,
      index: true,
    },
    team: { type: String, trim: true, default: "CareQuest Demo Team" },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

CareQuestMembershipSchema.index({ user: 1, organization: 1 }, { unique: true });

export default mongoose.models.CareQuestMembership ||
  mongoose.model("CareQuestMembership", CareQuestMembershipSchema);
