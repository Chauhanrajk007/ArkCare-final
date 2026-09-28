import mongoose from "mongoose";

const BookingPaymentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
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
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, unique: true, sparse: true, index: true },
    receipt: { type: String, required: true, unique: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["created", "verified", "booked", "failed", "expired", "refunded"],
      default: "created",
      index: true,
    },
    gatewayStatus: { type: String, default: "created" },
    expiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date, default: null },
    bookedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true }
);

BookingPaymentSchema.index({ patient: 1, status: 1, createdAt: -1 });

export default mongoose.models.BookingPayment ||
  mongoose.model("BookingPayment", BookingPaymentSchema);
