"use server";

import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import { requireUser } from "@/lib/auth";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";
import { getBookableDoctorById } from "@/lib/doctorDirectory";
import {
  doctorOffersSlot,
  expirePendingHoldForSlot,
  hospitalWeekday,
  resolveHospitalSlot,
  slotIsOccupied,
} from "@/lib/bookingSlots";

async function patientBookingContext(user) {
  if (user.role !== "patient") {
    throw new Error("Only patients can book appointments");
  }

  await connectDB();

  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const context = await getPrimaryProgramContext(patient);
  const timezone =
    context.organization?.settings?.defaultTimezone || "Asia/Kolkata";

  return { patient, context, timezone };
}

function assertBookableDoctor(doctor) {
  if (!doctor || doctor.status !== "approved") {
    throw new Error("Doctor is not available");
  }
  if (
    !Number.isFinite(Number(doctor.consultationFee)) ||
    Number(doctor.consultationFee) <= 0
  ) {
    throw new Error("Doctor does not have a valid consultation fee");
  }
}

export async function getLiveDoctorDayAvailability(doctorId, appointmentDay) {
  try {
    const user = await requireUser();
    const { context, timezone } = await patientBookingContext(user);

    const doctor = await getBookableDoctorById({
      doctorId,
      organizationId: context.organization._id,
    });
    assertBookableDoctor(doctor);

    const weekday = hospitalWeekday(appointmentDay);
    const offered =
      (doctor.availability || []).find((entry) => entry.day === weekday)?.slots ||
      [];

    const rows = [];

    for (const slot of offered) {
      const when = resolveHospitalSlot({
        appointmentDay,
        appointmentTime: slot,
        timezone,
      });

      if (when <= new Date()) {
        rows.push({
          time: slot,
          available: false,
          reason: "past",
        });
        continue;
      }

      await expirePendingHoldForSlot({
        doctorId: doctor._id,
        appointmentDate: when,
      });

      const occupied = await slotIsOccupied({
        doctorId: doctor._id,
        appointmentDate: when,
      });

      rows.push({
        time: slot,
        available: !occupied,
        reason: occupied ? "taken" : null,
      });
    }

    return {
      doctorId: doctor._id.toString(),
      doctorName: doctor.name,
      consultationFee: Number(doctor.consultationFee || 0),
      appointmentDay,
      weekday,
      timezone,
      slots: rows,
      refreshedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error loading live doctor availability:", error);
    return {
      error: error.message || "Could not load live availability",
      appointmentDay,
      slots: [],
    };
  }
}

export async function checkSlotAvailability(input, legacyAppointmentDate = null) {
  try {
    const user = await requireUser();
    const { context, timezone } = await patientBookingContext(user);

    const payload =
      typeof input === "object" && input !== null
        ? input
        : {
            doctorId: input,
            appointmentDate: legacyAppointmentDate,
          };

    const doctor = await getBookableDoctorById({
      doctorId: payload.doctorId,
      organizationId: context.organization._id,
    });
    assertBookableDoctor(doctor);

    const when =
      payload.appointmentDay && payload.appointmentTime
        ? resolveHospitalSlot({
            appointmentDay: payload.appointmentDay,
            appointmentTime: payload.appointmentTime,
            timezone,
          })
        : new Date(payload.appointmentDate);

    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      return { available: false, error: "Choose a future appointment time" };
    }

    if (!doctorOffersSlot(doctor, when, timezone)) {
      return {
        available: false,
        error: "That time is outside the doctor's current availability",
      };
    }

    await expirePendingHoldForSlot({
      doctorId: doctor._id,
      appointmentDate: when,
    });

    const occupied = await slotIsOccupied({
      doctorId: doctor._id,
      appointmentDate: when,
    });

    return {
      available: !occupied,
      appointmentDate: when.toISOString(),
      timezone,
      error: occupied
        ? "That appointment slot was just taken. Please choose another slot."
        : null,
    };
  } catch (error) {
    console.error("Error checking slot availability:", error);
    return {
      available: false,
      error: error.message || "Could not verify this slot",
    };
  }
}
