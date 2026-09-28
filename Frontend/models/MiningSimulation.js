import mongoose from "mongoose";

const MiningSimulationSchema = new mongoose.Schema(
  {
    simulationKey: { type: String, required: true, unique: true, index: true },
    activitySession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivitySession",
      required: true,
      index: true,
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: "HospitalProgram", required: true, index: true },
    simulatedCoinSymbol: { type: String, default: "CDC" },
    simulatedHashRate: { type: Number, required: true, min: 0 },
    simulatedHashes: { type: Number, required: true, min: 0 },
    simulatedAcceptedShares: { type: Number, required: true, min: 0 },
    simulatedPowerWatts: { type: Number, required: true, min: 0 },
    simulatedCoinAmount: { type: Number, required: true, min: 0 },
    simulatedPriceInr: { type: Number, required: true, min: 0 },
    simulatedGrossValueInr: { type: Number, required: true, min: 0 },
    patientShareInr: { type: Number, required: true, min: 0 },
    hospitalShareInr: { type: Number, required: true, min: 0 },
    platformShareInr: { type: Number, required: true, min: 0 },
    isSimulation: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true }
);

export default mongoose.models.MiningSimulation ||
  mongoose.model("MiningSimulation", MiningSimulationSchema);
