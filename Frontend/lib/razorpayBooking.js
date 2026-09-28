import crypto from "node:crypto";
import Razorpay from "razorpay";
import Appointment from "@/models/Appointment";
import BookingPayment from "@/models/BookingPayment";
import PaymentEvidence from "@/models/PaymentEvidence";
import {
  doctorOffersSlot,
  expirePendingHoldForSlot,
  slotIsOccupied,
} from "@/lib/bookingSlots";

let razorpay;

export function getRazorpayConfiguration() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = String(
    process.env.RAZORPAY_WEBHOOK_SECRET || ""
  ).trim();

  const configured = Boolean(keyId && keySecret);
  const mode = keyId.startsWith("rzp_live_")
    ? "live"
    : keyId.startsWith("rzp_test_")
      ? "test"
      : configured
        ? "unknown"
        : "unconfigured";

  return {
    configured,
    mode,
    webhookConfigured: Boolean(webhookSecret),
    ready:
      configured &&
      mode !== "unknown" &&
      (mode !== "live" || Boolean(webhookSecret)),
  };
}

export function getRazorpayClient() {
  if (!razorpay) {
    const config = getRazorpayConfiguration();
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

    if (!config.configured) {
      throw new Error(
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }

    if (config.mode === "unknown") {
      throw new Error("Razorpay key ID is not a recognized test or live key");
    }

    if (config.mode === "live" && !config.webhookConfigured) {
      throw new Error(
        "Live Razorpay bookings require RAZORPAY_WEBHOOK_SECRET to be configured"
      );
    }

    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

export function getRazorpayKeyId() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  if (!keyId) throw new Error("Razorpay key ID is not configured");
  return keyId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slotKeyFor(doctorId, appointmentDate) {
  return `${String(doctorId)}:${new Date(appointmentDate).toISOString()}`;
}

function safeReason(reason) {
  return String(reason || "").trim().slice(0, 1000);
}

function makeReceipt() {
  return (
    "ark_" +
    Date.now().toString(36) +
    "_" +
    crypto.randomUUID().replace(/-/g, "").slice(0, 14)
  ).slice(0, 40);
}

export async function createRazorpayBookingOrder({
  user,
  patient,
  doctor,
  appointmentDate,
  reason,
  programContext,
}) {
  const when = new Date(appointmentDate);
  if (Number.isNaN(when.getTime()) || when <= new Date()) {
    throw new Error("Choose a valid future appointment time");
  }

  const timezone =
    programContext?.organization?.settings?.defaultTimezone || "Asia/Kolkata";

  if (!doctorOffersSlot(doctor, when, timezone)) {
    throw new Error("That time is not in this doctor's current availability");
  }

  await expirePendingHoldForSlot({
    doctorId: doctor._id,
    appointmentDate: when,
  });

  if (
    await slotIsOccupied({
      doctorId: doctor._id,
      appointmentDate: when,
    })
  ) {
    throw new Error("That appointment slot was just taken. Please choose another slot.");
  }

  const amountPaise = Math.round(Number(doctor.consultationFee || 0) * 100);
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    throw new Error("This doctor does not have a valid payable consultation fee");
  }

  const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const slotKey = slotKeyFor(doctor._id, when);

  let appointment;
  try {
    appointment = await Appointment.create({
      organization: programContext.organization._id,
      program: programContext.program._id,
      patient: patient._id,
      doctor: doctor._id,
      appointmentDate: when,
      reason: safeReason(reason),
      status: "pending",
      slotKey,
      holdExpiresAt,
      amount: amountPaise / 100,
      currency: "INR",
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.slotKey) {
      throw new Error("That appointment slot was just taken. Please choose another slot.");
    }
    throw error;
  }

  const receipt = makeReceipt();
  let order;

  try {
    order = await getRazorpayClient().orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        appointmentId: appointment._id.toString(),
        doctorId: doctor._id.toString(),
        patientId: patient._id.toString(),
        userId: user._id.toString(),
        organizationId: programContext.organization._id.toString(),
        programId: programContext.program._id.toString(),
        appointmentDate: when.toISOString(),
      },
    });
  } catch (error) {
    await Appointment.deleteOne({
      _id: appointment._id,
      status: "pending",
      paymentId: { $exists: false },
    });
    throw error;
  }

  try {
    await BookingPayment.create({
      userId: user._id.toString(),
      patient: patient._id,
      doctor: doctor._id,
      appointment: appointment._id,
      orderId: order.id,
      receipt,
      amountPaise,
      currency: "INR",
      status: "created",
      gatewayStatus: order.status || "created",
      expiresAt: holdExpiresAt,
    });
  } catch (error) {
    await Appointment.updateOne(
      { _id: appointment._id, status: "pending" },
      {
        $set: { status: "cancelled" },
        $unset: { slotKey: "", holdExpiresAt: "" },
      }
    );
    throw error;
  }

  return {
    orderId: order.id,
    appointmentId: appointment._id.toString(),
    amount: amountPaise,
    currency: "INR",
    keyId: getRazorpayKeyId(),
    checkoutMode: getRazorpayKeyId().startsWith("rzp_live_") ? "live" : "test",
    expiresAt: holdExpiresAt.toISOString(),
    doctorFee: amountPaise / 100,
  };
}

async function fetchProviderState(orderId, paymentId) {
  const client = getRazorpayClient();
  const [payment, order] = await Promise.all([
    client.payments.fetch(paymentId),
    client.orders.fetch(orderId),
  ]);
  return { payment, order };
}

async function captureIfAuthorized({
  payment,
  orderId,
  amountPaise,
  currency,
  allowCapture,
}) {
  if (payment.status !== "authorized" || !allowCapture) return payment;

  try {
    return await getRazorpayClient().payments.capture(
      payment.id,
      amountPaise,
      currency
    );
  } catch (error) {
    // A concurrent webhook/callback may have captured it first.
    const latest = await getRazorpayClient().payments.fetch(payment.id);
    if (latest.status === "captured") return latest;
    throw error;
  }
}

async function fetchPaidOrder(orderId) {
  let latest;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    latest = await getRazorpayClient().orders.fetch(orderId);
    if (latest.status === "paid") return latest;
    await sleep(250);
  }
  return latest;
}

async function refundBecauseSlotUnavailable(booking, paymentId) {
  const client = getRazorpayClient();
  let refund = null;

  try {
    refund = await client.payments.refund(paymentId, {
      amount: booking.amountPaise,
      notes: {
        reason: "appointment_slot_unavailable",
        bookingOrderId: booking.orderId,
      },
    });
  } catch (error) {
    await BookingPayment.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "failed",
          gatewayStatus: "captured_refund_required",
          failureReason:
            "Payment captured but appointment slot unavailable; manual refund check required",
        },
      }
    );
    throw new Error(
      "Payment was captured but the slot became unavailable. Refund processing needs review."
    );
  }

  await BookingPayment.updateOne(
    { _id: booking._id },
    {
      $set: {
        status: "refunded",
        gatewayStatus: refund?.status || "refund_created",
        paymentId,
        failureReason: "Slot unavailable after payment; refund initiated",
      },
    }
  );

  return refund;
}

export async function finalizeCapturedBooking({
  orderId,
  paymentId,
  expectedUserId = null,
  allowCapture = false,
}) {
  const booking = await BookingPayment.findOne({ orderId });
  if (!booking) throw new Error("Booking payment order not found");

  if (expectedUserId && booking.userId !== String(expectedUserId)) {
    throw new Error("Payment order belongs to another user");
  }

  if (booking.status === "booked") {
    const existing = await Appointment.findById(booking.appointment).lean();
    return {
      success: true,
      appointmentId: existing?._id?.toString() || booking.appointment.toString(),
      paymentId: booking.paymentId,
      orderId: booking.orderId,
      duplicate: true,
    };
  }

  if (booking.status === "refunded") {
    throw new Error("This payment was refunded and cannot create an appointment");
  }

  let { payment, order } = await fetchProviderState(orderId, paymentId);

  if (payment.order_id !== orderId) {
    throw new Error("Payment does not belong to this Razorpay order");
  }
  if (String(payment.currency || "").toUpperCase() !== booking.currency) {
    throw new Error("Payment currency does not match booking");
  }
  if (
    Number(payment.amount) !== Number(booking.amountPaise) ||
    Number(order.amount) !== Number(booking.amountPaise)
  ) {
    throw new Error("Payment amount does not match the booking amount");
  }
  if (String(order.notes?.userId || "") !== booking.userId) {
    throw new Error("Razorpay order user does not match booking");
  }
  if (String(order.notes?.doctorId || "") !== booking.doctor.toString()) {
    throw new Error("Razorpay order doctor does not match booking");
  }
  if (String(order.notes?.appointmentId || "") !== booking.appointment.toString()) {
    throw new Error("Razorpay order appointment does not match booking");
  }

  payment = await captureIfAuthorized({
    payment,
    orderId,
    amountPaise: booking.amountPaise,
    currency: booking.currency,
    allowCapture,
  });

  if (payment.status !== "captured") {
    throw new Error(
      `Payment is ${payment.status || "not captured"}; appointment is not confirmed`
    );
  }

  order = await fetchPaidOrder(orderId);
  if (order.status !== "paid") {
    throw new Error("Razorpay order is not in paid state");
  }

  await BookingPayment.updateOne(
    { _id: booking._id, status: { $in: ["created", "verified", "failed"] } },
    {
      $set: {
        status: "verified",
        paymentId,
        gatewayStatus: payment.status,
        verifiedAt: new Date(),
        failureReason: "",
      },
    }
  );

  let appointment = await Appointment.findById(booking.appointment);
  if (!appointment) {
    await refundBecauseSlotUnavailable(booking, paymentId);
    throw new Error("Appointment hold no longer exists; refund initiated");
  }

  if (appointment.status !== "confirmed") {
    const targetSlotKey = slotKeyFor(booking.doctor, appointment.appointmentDate);

    if (appointment.status !== "pending") {
      await expirePendingHoldForSlot({
        doctorId: booking.doctor,
        appointmentDate: appointment.appointmentDate,
      });

      const occupied = await Appointment.findOne({
        _id: { $ne: appointment._id },
        doctor: booking.doctor,
        appointmentDate: appointment.appointmentDate,
        status: { $in: ["pending", "confirmed"] },
      }).lean();

      if (occupied) {
        await refundBecauseSlotUnavailable(booking, paymentId);
        throw new Error("Appointment slot became unavailable; refund initiated");
      }
    }

    appointment.status = "confirmed";
    appointment.slotKey = targetSlotKey;
    appointment.holdExpiresAt = undefined;
    appointment.paymentId = paymentId;
    appointment.paymentOrderId = orderId;
    appointment.amount = booking.amountPaise / 100;
    appointment.currency = booking.currency;

    try {
      await appointment.save();
    } catch (error) {
      if (error?.code === 11000) {
        await refundBecauseSlotUnavailable(booking, paymentId);
        throw new Error("Appointment slot became unavailable; refund initiated");
      }
      throw error;
    }
  }

  await PaymentEvidence.findOneAndUpdate(
    { appointment: appointment._id },
    {
      $set: {
        organization: appointment.organization,
        program: appointment.program,
        appointment: appointment._id,
        provider: "razorpay",
        providerPaymentId: paymentId,
        providerOrderId: orderId,
        currency: booking.currency,
        paymentMethod: payment.method || null,
        grossAmount: booking.amountPaise / 100,
        refundAmount: 0,
        netPaidAmount: booking.amountPaise / 100,
        status: "paid",
        capturedAt: new Date(
          Number(payment.captured_at || payment.created_at || Date.now() / 1000) *
            1000
        ),
        refundedAt: null,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );

  const bookingTransition = await BookingPayment.findOneAndUpdate(
    {
      _id: booking._id,
      status: { $ne: "booked" },
    },
    {
      $set: {
        status: "booked",
        paymentId,
        gatewayStatus: payment.status,
        bookedAt: new Date(),
      },
    },
    { new: true }
  );

  if (bookingTransition) {
    try {
      const { recordAppointmentBooked } = await import("@/lib/carequest/service");
      await recordAppointmentBooked(appointment, booking.userId);
    } catch (error) {
      console.error("CareQuest follow-up booking hook failed:", error);
    }
  }

  return {
    success: true,
    appointmentId: appointment._id.toString(),
    paymentId,
    orderId,
    amount: booking.amountPaise / 100,
    currency: booking.currency,
  };
}

export async function markPaymentAttemptFailed({
  orderId,
  paymentId = null,
  reason = "payment_failed",
}) {
  const update = {
    gatewayStatus: "payment_failed",
    failureReason: String(reason || "payment_failed").slice(0, 500),
  };
  if (paymentId) update.paymentId = paymentId;

  const result = await BookingPayment.updateOne(
    {
      orderId,
      status: "created",
      expiresAt: { $gt: new Date() },
    },
    { $set: update }
  );

  return { updated: result.modifiedCount > 0 };
}

export async function releaseBookingHold({
  orderId,
  userId = null,
  reason = "checkout_closed",
}) {
  const query = { orderId, status: "created" };
  if (userId) query.userId = String(userId);

  const booking = await BookingPayment.findOneAndUpdate(
    query,
    {
      $set: {
        status: "failed",
        gatewayStatus: "checkout_closed",
        failureReason: String(reason).slice(0, 500),
      },
    },
    { new: true }
  );

  if (!booking) return { released: false };

  await Appointment.deleteOne({
    _id: booking.appointment,
    status: "pending",
    paymentId: { $exists: false },
  });

  return { released: true };
}

export async function refundBookedAppointment({
  appointmentId,
  reason = "appointment_cancelled",
}) {
  const booking = await BookingPayment.findOne({ appointment: appointmentId });
  if (!booking) {
    return { refunded: false, paymentRequired: false };
  }

  if (booking.status === "refunded") {
    return {
      refunded: true,
      duplicate: true,
      paymentId: booking.paymentId || null,
    };
  }

  // Demo/test-bypass appointments intentionally have no BookingPayment.
  // A real paid appointment must have reached the booked state before refund.
  if (booking.status !== "booked" || !booking.paymentId) {
    throw new Error(
      "Paid booking is not in a refundable state. Review the payment before cancelling."
    );
  }

  const client = getRazorpayClient();
  const payment = await client.payments.fetch(booking.paymentId);

  if (payment.status !== "captured") {
    throw new Error(
      "Razorpay payment is not captured; cancellation requires payment review."
    );
  }

  let refund;
  try {
    refund = await client.payments.refund(booking.paymentId, {
      amount: booking.amountPaise,
      notes: {
        reason: String(reason || "appointment_cancelled").slice(0, 200),
        bookingOrderId: booking.orderId,
        appointmentId: String(booking.appointment),
      },
    });
  } catch (error) {
    const latest = await BookingPayment.findById(booking._id).lean();
    if (latest?.status === "refunded") {
      return {
        refunded: true,
        duplicate: true,
        paymentId: latest.paymentId || booking.paymentId,
      };
    }
    throw new Error(
      "Razorpay refund could not be initiated. Appointment remains confirmed."
    );
  }

  await Promise.all([
    BookingPayment.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "refunded",
          gatewayStatus: refund?.status || "refund_created",
          failureReason: "Appointment cancelled; refund initiated",
        },
      }
    ),
    PaymentEvidence.updateOne(
      { appointment: booking.appointment },
      {
        $set: {
          refundAmount: booking.amountPaise / 100,
          netPaidAmount: 0,
          status: "refunded",
          refundedAt: new Date(),
        },
      }
    ),
  ]);

  return {
    refunded: true,
    refundId: refund?.id || null,
    refundStatus: refund?.status || "refund_created",
    paymentId: booking.paymentId,
    orderId: booking.orderId,
    amount: booking.amountPaise / 100,
    currency: booking.currency,
  };
}

export async function markRefundFromWebhook({
  orderId,
  paymentId,
  refundAmountPaise,
  refundStatus,
}) {
  const booking = await BookingPayment.findOne({ orderId });
  if (!booking) return { updated: false };

  const amount = Math.max(0, Number(refundAmountPaise || 0)) / 100;
  const fullRefund = amount >= booking.amountPaise / 100;

  await BookingPayment.updateOne(
    { _id: booking._id },
    {
      $set: {
        status: fullRefund ? "refunded" : booking.status,
        gatewayStatus: refundStatus || "refunded",
        paymentId: paymentId || booking.paymentId,
      },
    }
  );

  await PaymentEvidence.updateOne(
    { appointment: booking.appointment },
    {
      $set: {
        refundAmount: amount,
        netPaidAmount: Math.max(0, booking.amountPaise / 100 - amount),
        status: fullRefund ? "refunded" : "partially_refunded",
        refundedAt: new Date(),
      },
    }
  );

  return { updated: true };
}
