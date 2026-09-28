import Appointment from "@/models/Appointment";
import BookingPayment from "@/models/BookingPayment";
import { localDateTimeToUtc } from "@/lib/carequest/time.mjs";

export function localSlotParts(date, timezone = "Asia/Kolkata") {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid appointment date");
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    weekday: parts.weekday,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function parseHospitalDateKey(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Choose a valid appointment date");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("Choose a valid appointment date");
  }

  return { year, month, day };
}

export function hospitalWeekday(dateKey) {
  const parts = parseHospitalDateKey(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function resolveHospitalSlot({
  appointmentDay,
  appointmentTime,
  timezone = "Asia/Kolkata",
}) {
  const parts = parseHospitalDateKey(appointmentDay);
  const timeMatch = String(appointmentTime || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch) throw new Error("Choose a valid appointment time");

  return localDateTimeToUtc(
    parts,
    `${timeMatch[1]}:${timeMatch[2]}`,
    timezone
  );
}

export function doctorOffersSlot(doctor, date, timezone = "Asia/Kolkata") {
  const { weekday, time } = localSlotParts(date, timezone);
  return (doctor.availability || []).some(
    (entry) =>
      entry.day === weekday &&
      Array.isArray(entry.slots) &&
      entry.slots.includes(time)
  );
}

export async function expirePendingHoldForSlot({
  doctorId,
  appointmentDate,
  now = new Date(),
}) {
  const expired = await Appointment.find({
    doctor: doctorId,
    appointmentDate: new Date(appointmentDate),
    status: "pending",
    holdExpiresAt: { $lte: now },
    paymentId: { $exists: false },
  })
    .select("_id")
    .lean();

  if (!expired.length) return 0;

  const appointmentIds = expired.map((item) => item._id);

  await Promise.all([
    BookingPayment.updateMany(
      {
        appointment: { $in: appointmentIds },
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
      _id: { $in: appointmentIds },
      status: "pending",
      paymentId: { $exists: false },
    }),
  ]);

  return appointmentIds.length;
}

export async function slotIsOccupied({ doctorId, appointmentDate }) {
  const now = new Date();

  return Boolean(
    await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      $or: [
        { status: "confirmed" },
        {
          status: "pending",
          holdExpiresAt: { $gt: now },
        },
      ],
    }).lean()
  );
}
