import mongoose from "mongoose";

const PaymentEvidenceSchema = new mongoose.Schema(
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
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["razorpay", "demo"],
      required: true,
    },
    providerPaymentId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    providerOrderId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    currency: { type: String, default: "INR" },
    paymentMethod: { type: String, default: null, trim: true },
    grossAmount: { type: Number, required: true, min: 0 },
    refundAmount: { type: Number, default: 0, min: 0 },
    netPaidAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["paid", "partially_refunded", "refunded", "demo"],
      required: true,
      index: true,
    },
    capturedAt: { type: Date, default: Date.now },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PaymentEvidenceSchema.index({ organization: 1, status: 1, capturedAt: -1 });

export default mongoose.models.PaymentEvidence ||
  mongoose.model("PaymentEvidence", PaymentEvidenceSchema);
