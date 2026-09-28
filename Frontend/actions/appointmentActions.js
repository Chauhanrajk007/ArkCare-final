"use server";

import connectDB from "@/lib/db";
import Appointment from "@/models/Appointment";
import PaymentEvidence from "@/models/PaymentEvidence";
import BookingPayment from "@/models/BookingPayment";
import Patient from "@/models/Patient";
import Doctor from "@/models/Doctor";
import { requireUser } from "@/lib/auth";
import { getPrimaryProgramContext, getProgramContextForDoctor } from "@/lib/carequest/programs";
import {
  doctorOffersSlot,
  expirePendingHoldForSlot,
  slotIsOccupied,
} from "@/lib/bookingSlots";
import { ensureCareQuestMembership } from "@/lib/carequest/permissions";
import { refundBookedAppointment } from "@/lib/razorpayBooking";

function assertPatient(user) {
  if (user.role !== "patient") {
    throw new Error("Only patient accounts can book appointments");
  }
}

export async function createAppointment(appointmentData) {
  const user = await requireUser();
  assertPatient(user);

  // Production bookings must go through createPaymentOrder -> Razorpay ->
  // verifyPayment. This action remains only for isolated automated test fixtures.
  const testBypass =
    process.env.CAREQUEST_TEST_BOOKING_BYPASS === "true" &&
    user.email === "demo.patient@arkcare.local" &&
    appointmentData?.demoBooking === true;

  if (!testBypass) {
    throw new Error("Use the Razorpay checkout flow to book this appointment");
  }

  const userId = user._id.toString();
  await connectDB();

  const patient = await Patient.findOne({ userId });
  if (!patient) throw new Error("Patient profile not found");

  const doctor = await Doctor.findById(appointmentData.doctorId);
  if (!doctor || doctor.status !== "approved") {
    throw new Error("Doctor not available");
  }

  const programContext = await getPrimaryProgramContext(patient);
  // The appointment is owned by the DOCTOR's hospital, so it surfaces in that
  // doctor's dashboard and that hospital's data/audit, regardless of the
  // patient's primary program. This is what makes bookings with doctors from
  // other hospitals work end-to-end (dashboard, chat, calls, care plans).
  const doctorContext = await getProgramContextForDoctor(doctor);
  const appointmentDate = new Date(appointmentData.appointmentDate);
  if (Number.isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
    throw new Error("Choose a valid future appointment time");
  }

  const timezone =
    doctorContext.organization?.settings?.defaultTimezone || "Asia/Kolkata";
  if (!doctorOffersSlot(doctor, appointmentDate, timezone)) {
    throw new Error("That time is outside the doctor's current availability");
  }

  await expirePendingHoldForSlot({
    doctorId: doctor._id,
    appointmentDate,
  });

  if (
    await slotIsOccupied({
      doctorId: doctor._id,
      appointmentDate,
    })
  ) {
    throw new Error("That appointment slot was just taken. Please choose another slot.");
  }

  const slotKey = `${doctor._id.toString()}:${appointmentDate.toISOString()}`;

  let appointment;
  try {
    appointment = await Appointment.create({
      organization: doctorContext.organization._id,
      program: doctorContext.program._id,
      patient: patient._id,
      doctor: doctor._id,
      appointmentDate,
      reason: String(appointmentData.reason || "").trim(),
      status: "confirmed",
      slotKey,
      amount: 0,
      currency: "INR",
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.slotKey) {
      throw new Error("That appointment slot was just taken. Please choose another slot.");
    }
    throw error;
  }

  await PaymentEvidence.findOneAndUpdate(
    { appointment: appointment._id },
    {
      $setOnInsert: {
        organization: doctorContext.organization._id,
        program: doctorContext.program._id,
        appointment: appointment._id,
        provider: "demo",
        providerPaymentId: null,
        providerOrderId: null,
        currency: "INR",
        grossAmount: 0,
        refundAmount: 0,
        netPaidAmount: 0,
        status: "demo",
        capturedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  try {
    const { recordAppointmentBooked } = await import("@/lib/carequest/service");
    await recordAppointmentBooked(appointment, user._id.toString());
  } catch (error) {
    console.error("CareQuest follow-up booking hook failed:", error);
  }

  return {
    success: true,
    appointmentId: appointment._id.toString(),
    demoBooking: true,
  };
}

export async function cancelPatientAppointment(
  appointmentId,
  reason = "patient_cancelled"
) {
  const user = await requireUser();
  assertPatient(user);

  await connectDB();

  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const appointment = await Appointment.findOne({
    _id: appointmentId,
    patient: patient._id,
  });

  if (!appointment) throw new Error("Appointment not found");

  if (appointment.status === "cancelled") {
    return {
      success: true,
      duplicate: true,
      refund: null,
    };
  }

  if (appointment.status !== "confirmed") {
    throw new Error("Only confirmed appointments can be cancelled");
  }

  if (new Date(appointment.appointmentDate) <= new Date()) {
    throw new Error("Past appointments cannot be cancelled from the patient portal");
  }

  let refund = null;
  if (appointment.paymentId) {
    refund = await refundBookedAppointment({
      appointmentId: appointment._id,
      reason: "patient_cancelled_appointment",
    });

    if (!refund?.refunded) {
      throw new Error(
        "The paid appointment could not be refunded, so cancellation was not applied"
      );
    }
  }

  appointment.status = "cancelled";
  appointment.cancelledAt = new Date();
  appointment.cancelledByRole = "patient";
  appointment.cancellationReason = String(reason || "patient_cancelled")
    .trim()
    .slice(0, 1000);
  appointment.slotKey = undefined;
  appointment.holdExpiresAt = undefined;

  await appointment.save();

  return {
    success: true,
    refund: refund
      ? {
          refunded: true,
          refundId: refund.refundId || null,
          refundStatus: refund.refundStatus || null,
          amount: refund.amount || 0,
          currency: refund.currency || "INR",
        }
      : {
          refunded: false,
          paymentRequired: false,
          amount: 0,
          currency: appointment.currency || "INR",
        },
  };
}

export async function getPatientAppointments() {
  try {
    const user = await requireUser();
    assertPatient(user);
    const userId = user._id.toString();

    await connectDB();

    const patient = await Patient.findOne({ userId });
    if (!patient) return [];

    const expiredHolds = await Appointment.find({
      patient: patient._id,
      status: "pending",
      holdExpiresAt: { $lte: new Date() },
      paymentId: { $exists: false },
    })
      .select("_id")
      .lean();

    if (expiredHolds.length) {
      const expiredIds = expiredHolds.map((item) => item._id);
      await Promise.all([
        BookingPayment.updateMany(
          {
            appointment: { $in: expiredIds },
            status: "created",
          },
          {
            $set: {
              status: "expired",
              gatewayStatus: "hold_expired",
              failureReason: "Appointment slot hold expired before payment confirmation",
            },
          }
        ),
        Appointment.deleteMany({
          _id: { $in: expiredIds },
          status: "pending",
          paymentId: { $exists: false },
        }),
      ]);
    }

    const appointments = await Appointment.find({
      patient: patient._id,
      status: { $ne: "pending" },
    })
      .populate({
        path: "doctor",
        select: "name specialization category consultationFee userId",
      })
      .populate({
        path: "patient",
        select: "name email userId",
      })
      .sort({ appointmentDate: -1 })
      .lean();

    const visibleAppointments = appointments.filter(
      (appointment) => appointment.doctor
    );
    const appointmentIds = visibleAppointments.map((item) => item._id);

    const [evidenceRows, bookingRows] = await Promise.all([
      PaymentEvidence.find({
        appointment: { $in: appointmentIds },
      }).lean(),
      BookingPayment.find({
        appointment: { $in: appointmentIds },
        userId,
      })
        .select(
          "appointment orderId paymentId status gatewayStatus amountPaise currency verifiedAt bookedAt failureReason"
        )
        .lean(),
    ]);

    const evidenceByAppointment = new Map(
      evidenceRows.map((row) => [String(row.appointment), row])
    );
    const bookingByAppointment = new Map(
      bookingRows.map((row) => [String(row.appointment), row])
    );

    return JSON.parse(
      JSON.stringify(
        visibleAppointments.map((appointment) => {
          const evidence = evidenceByAppointment.get(String(appointment._id));
          const booking = bookingByAppointment.get(String(appointment._id));

          return {
            ...appointment,
            payment: evidence
              ? {
                  provider: evidence.provider,
                  status: evidence.status,
                  grossAmount: evidence.grossAmount,
                  refundAmount: evidence.refundAmount,
                  netPaidAmount: evidence.netPaidAmount,
                  currency: evidence.currency,
                  paymentMethod: evidence.paymentMethod || null,
                  paymentId: evidence.providerPaymentId,
                  orderId: evidence.providerOrderId,
                  capturedAt: evidence.capturedAt,
                  refundedAt: evidence.refundedAt,
                  gatewayStatus: booking?.gatewayStatus || null,
                  bookingStatus: booking?.status || null,
                  verifiedAt: booking?.verifiedAt || null,
                  bookedAt: booking?.bookedAt || null,
                }
              : null,
          };
        })
      )
    );
  } catch (error) {
    console.error("Error fetching patient appointments:", error);
    return [];
  }
}

export async function getDoctorAppointments() {
  try {
    const user = await requireUser();
    if (user.role !== "doctor") throw new Error("Doctor access required");

    const userId = user._id.toString();
    await connectDB();

    const doctor = await Doctor.findOne({ userId });
    if (!doctor) return [];
    const membership = await ensureCareQuestMembership(user, "doctor");
    if (!membership?.active) return [];

    const appointments = await Appointment.find({
      doctor: doctor._id,
      status: { $ne: "pending" },
      $or: [
        { organization: membership.organization._id },
        { organization: null },
        { organization: { $exists: false } },
      ],
    })
      .populate({
        path: "patient",
        select: "name email userId",
      })
      .populate({
        path: "doctor",
        select: "name specialization category consultationFee userId",
      })
      .sort({ appointmentDate: -1 })
      .lean();

    return JSON.parse(
      JSON.stringify(appointments.filter((appointment) => appointment.patient))
    );
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    return [];
  }
}

export async function updateAppointmentStatus(appointmentId, status, notes = "") {
  const allowedStatuses = new Set(["confirmed", "completed", "cancelled"]);
  if (!allowedStatuses.has(status)) throw new Error("Invalid appointment status");

  const user = await requireUser();
  if (user.role !== "doctor") throw new Error("Doctor access required");

  const userId = user._id.toString();
  await connectDB();

  const doctor = await Doctor.findOne({ userId });
  if (!doctor) throw new Error("Doctor not found");
  const membership = await ensureCareQuestMembership(user, "doctor");
  if (!membership?.active) throw new Error("Active hospital membership required");

  const appointment = await Appointment.findOne({
    _id: appointmentId,
    doctor: doctor._id,
    $or: [
      { organization: membership.organization._id },
      { organization: null },
      { organization: { $exists: false } },
    ],
  });

  if (!appointment) throw new Error("Appointment not found");

  if (
    ["completed", "cancelled"].includes(appointment.status) &&
    status !== appointment.status
  ) {
    throw new Error("Completed or cancelled appointments cannot be reopened");
  }

  if (status === "confirmed") {
    const slotKey =
      appointment.slotKey ||
      `${doctor._id.toString()}:${new Date(appointment.appointmentDate).toISOString()}`;

    const conflict = await Appointment.findOne({
      _id: { $ne: appointment._id },
      doctor: doctor._id,
      appointmentDate: appointment.appointmentDate,
      status: { $in: ["pending", "confirmed"] },
    }).lean();

    if (conflict) {
      throw new Error("That appointment slot is already occupied");
    }

    appointment.slotKey = slotKey;
  } else {
    appointment.slotKey = undefined;
  }

  let refund = null;
  if (
    status === "cancelled" &&
    appointment.status === "confirmed" &&
    appointment.paymentId
  ) {
    refund = await refundBookedAppointment({
      appointmentId: appointment._id,
      reason: "doctor_cancelled_appointment",
    });

    if (!refund?.refunded) {
      throw new Error(
        "Paid appointment could not be refunded; cancellation was not applied"
      );
    }
  }

  appointment.status = status;
  if (status === "cancelled") {
    appointment.cancelledAt = new Date();
    appointment.cancelledByRole = "doctor";
    appointment.cancellationReason = String(
      notes || "doctor_cancelled_appointment"
    )
      .trim()
      .slice(0, 1000);
  }
  if (notes !== undefined) {
    appointment.notes = String(notes || "").trim().slice(0, 4000);
  }

  try {
    await appointment.save();
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.slotKey) {
      throw new Error("That appointment slot is already occupied");
    }
    throw error;
  }

  if (status === "completed") {
    try {
      const { recordAppointmentCompleted } = await import("@/lib/carequest/service");
      await recordAppointmentCompleted(appointment, user._id.toString());
    } catch (error) {
      console.error("CareQuest attendance hook failed:", error);
    }
  }

  return {
    success: true,
    refund: refund
      ? {
          refunded: true,
          refundId: refund.refundId || null,
          refundStatus: refund.refundStatus || null,
          amount: refund.amount || 0,
          currency: refund.currency || "INR",
        }
      : null,
  };
}
