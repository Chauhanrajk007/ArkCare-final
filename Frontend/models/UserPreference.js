import mongoose from "mongoose";

const UserPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    careQuestOptIn: { type: Boolean, default: true },
    paused: { type: Boolean, default: false },
    timezone: { type: String, default: "Asia/Kolkata" },
    locale: { type: String, default: "en-IN" },
    accessibility: {
      reducedMotion: { type: Boolean, default: false },
      largerText: { type: Boolean, default: false },
      audioSupport: { type: Boolean, default: false },
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" },
      end: { type: String, default: "07:00" },
    },
    revealSensitiveLockScreenText: { type: Boolean, default: false },
    celebrationEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.UserPreference ||
  mongoose.model("UserPreference", UserPreferenceSchema);
