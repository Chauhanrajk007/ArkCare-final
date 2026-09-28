import mongoose from "mongoose";

const BlockchainAccountSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    walletAddress: { type: String, required: true, unique: true, index: true },
    network: { type: String, default: "carequest-local-evm" },
    chainId: { type: Number, default: 31337 },
  },
  { timestamps: true }
);

export default mongoose.models.BlockchainAccount ||
  mongoose.model("BlockchainAccount", BlockchainAccountSchema);
