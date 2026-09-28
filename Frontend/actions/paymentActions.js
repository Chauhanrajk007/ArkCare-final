"use server";

import crypto from "node:crypto";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import BookingPayment from "@/models/BookingPayment";
import { requireUser } from "@/lib/auth";
import { getPrimaryProgramContext, getProgramContextForDoctor } from "@/lib/carequest/programs";
import { resolveHospitalSlot } from "@/lib/bookingSlots";
import { getBookableDoctorById } from "@/lib/doctorDirectory";
import {
  createRazorpayBookingOrder,
  finalizeCapturedBooking,
  markPaymentAttemptFailed,
  releaseBookingHold,
  getRazorpayConfiguration,
} from "@/lib/razorpayBooking";

function timingSafeSignatureMatch(expectedHex, receivedHex) {
  const expected = Buffer.from(String(expectedHex || ""), "utf8");
  const received = Buffer.from(String(receivedHex || ""), "utf8");
  return (
    expected.length === received.length &&
    expected.length > 0 &&
    crypto.timingSafeEqual(expected, received)
  );
}

export async function getPaymentConfigurationStatus() {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Patient access required");
  }

  const config = getRazorpayConfiguration();
  return {
    configured: config.configured,
    mode: config.mode,
    webhookConfigured: config.webhookConfigured,
    ready: config.ready,
  };
}

export async function createPaymentOrder(input) {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Only patients can create payment orders");
  }

  const payload =
    typeof input === "string" ? { doctorId: input } : input || {};

  await connectDB();

  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const programContext = await getPrimaryProgramContext(patient);

  const doctor = await getBookableDoctorById({
    doctorId: payload.doctorId,
    organizationId: programContext.organization._id,
  });

  if (!doctor) {
    throw new Error(
      "Doctor is no longer approved, assigned to your hospital, or bookable. Refresh the live doctor list."
    );
  }

  // The booking (and its audit) belongs to the DOCTOR's hospital, so it shows up
  // in that doctor's dashboard and that hospital's data regardless of the
  // patient's primary program.
  const doctorContext = await getProgramContextForDoctor(doctor);
  const timezone =
    doctorContext.organization?.settings?.defaultTimezone || "Asia/Kolkata";

  const appointmentDate =
    payload.appointmentDay && payload.appointmentTime
      ? resolveHospitalSlot({
          appointmentDay: payload.appointmentDay,
          appointmentTime: payload.appointmentTime,
          timezone,
        })
      : payload.appointmentDate
        ? new Date(payload.appointmentDate)
        : null;

  if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) {
    throw new Error("Appointment date and time are required before payment");
  }

  return createRazorpayBookingOrder({
    user,
    patient,
    doctor,
    appointmentDate,
    reason: payload.reason,
    programContext: doctorContext,
  });
}

export async function verifyPayment(paymentData) {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Only patients can verify payments");
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = paymentData || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new Error("Missing required payment verification fields");
  }

  await connectDB();

  const booking = await BookingPayment.findOne({
    orderId: razorpay_order_id,
    userId: user._id.toString(),
  }).lean();

  if (!booking) {
    throw new Error("Payment order was not created by this signed-in patient");
  }

  const secret = String(process.env.RAZORPAY_KEY_SECRET || "");
  if (!secret) throw new Error("Razorpay is not configured");

  // Razorpay requires the server-created order id, not an arbitrary id supplied
  // by the browser, to be used in the HMAC source string.
  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(booking.orderId + "|" + razorpay_payment_id)
    .digest("hex");

  if (!timingSafeSignatureMatch(generatedSignature, razorpay_signature)) {
    throw new Error("Payment signature verification failed");
  }

  return finalizeCapturedBooking({
    orderId: booking.orderId,
    paymentId: razorpay_payment_id,
    expectedUserId: user._id.toString(),
    allowCapture: true,
  });
}

export async function reportPaymentFailure({
  orderId,
  paymentId = null,
  reason = "payment_failed",
}) {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Only patients can report payment attempts");
  }

  await connectDB();

  const booking = await BookingPayment.findOne({
    orderId: String(orderId || ""),
    userId: user._id.toString(),
  })
    .select("_id orderId")
    .lean();

  if (!booking) {
    throw new Error("Payment order was not created by this signed-in patient");
  }

  return markPaymentAttemptFailed({
    orderId: booking.orderId,
    paymentId,
    reason,
  });
}

export async function releasePaymentOrder(orderId, reason = "checkout_closed") {
  const user = await requireUser();
  if (user.role !== "patient") {
    throw new Error("Only patients can release booking holds");
  }

  await connectDB();

  return releaseBookingHold({
    orderId,
    userId: user._id.toString(),
    reason,
  });
}
