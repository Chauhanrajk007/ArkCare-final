import ScheduledOccurrence from "@/models/ScheduledOccurrence";
import ReminderDelivery from "@/models/ReminderDelivery";
import UserPreference from "@/models/UserPreference";
import Patient from "@/models/Patient";
import { pusherServer } from "@/lib/pusher";
import { appendAuditEvent } from "@/lib/carequest/audit";
import { localDateTimeToUtc } from "@/lib/carequest/time.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GENERATION_DAYS = 14;
const QSTASH_FREE_DELAY_SECONDS = 7 * 24 * 60 * 60;

function dateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addCalendarDays(parts, days) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return dateParts(d);
}

function buildDates(activity, version) {
  const start = dateParts(new Date(version.validFrom));
  const validTo = version.validTo
    ? new Date(version.validTo)
    : new Date(new Date(version.validFrom).getTime() + MAX_GENERATION_DAYS * DAY_MS);
  const maxEnd = new Date(new Date(version.validFrom).getTime() + MAX_GENERATION_DAYS * DAY_MS);
  const end = validTo < maxEnd ? validTo : maxEnd;
  const recurrence = activity.recurrence || { kind: "once", interval: 1 };
  const result = [];

  if (recurrence.kind === "once") {
    const offset = activity.type === "follow_up" ? 7 : 0;
    result.push(addCalendarDays(start, offset));
    return result;
  }

  for (let offset = 0; offset <= MAX_GENERATION_DAYS; offset += 1) {
    const parts = addCalendarDays(start, offset);
    const atNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
    if (atNoon > end) break;

    if (recurrence.kind === "daily") {
      if (offset % Number(recurrence.interval || 1) === 0) result.push(parts);
      continue;
    }

    if (recurrence.kind === "weekly" || recurrence.kind === "custom") {
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      const days = Array.isArray(recurrence.daysOfWeek) && recurrence.daysOfWeek.length
        ? recurrence.daysOfWeek
        : [new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay()];
      if (days.includes(weekday)) result.push(parts);
    }
  }

  return result;
}

export async function enqueueOccurrence(occurrence) {
  if (!process.env.QSTASH_TOKEN || !process.env.NEXT_PUBLIC_APP_URL) {
    return { queued: false, mode: "database_local" };
  }

  const secondsUntil = Math.floor((new Date(occurrence.scheduledFor).getTime() - Date.now()) / 1000);
  if (secondsUntil > QSTASH_FREE_DELAY_SECONDS) {
    return { queued: false, mode: "outside_free_delay_window" };
  }

  const destination =
    process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") +
    "/api/carequest/jobs/occurrence-due";
  const endpoint =
    "https://qstash.upstash.io/v2/publish/" + encodeURIComponent(destination);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.QSTASH_TOKEN,
      "Content-Type": "application/json",
      "Upstash-Method": "POST",
      "Upstash-Not-Before": String(
        Math.max(Math.floor(Date.now() / 1000), Math.floor(new Date(occurrence.scheduledFor).getTime() / 1000))
      ),
      "Upstash-Retries": "3",
      "Upstash-Deduplication-Id": occurrence.occurrenceKey,
      "Upstash-Forward-X-CareQuest-Job-Secret": process.env.CAREQUEST_JOB_SECRET || "",
    },
    body: JSON.stringify({ occurrenceId: String(occurrence._id) }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    occurrence.deliveryStatus = "failed";
    await occurrence.save();
    return { queued: false, error: data.error || "QStash publish failed" };
  }

  occurrence.qstashMessageId = data.messageId || data.scheduleId || null;
  occurrence.deliveryStatus = "queued";
  await occurrence.save();
  return { queued: true, messageId: occurrence.qstashMessageId };
}

export async function generateOccurrencesForApprovedVersion(carePlan, version) {
  await ScheduledOccurrence.updateMany(
    {
      carePlan: carePlan._id,
      status: "scheduled",
      scheduledFor: { $gt: new Date() },
      planVersion: { $ne: version._id },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "Superseded by approved plan version " + version.versionNumber,
      },
    }
  );

  const created = [];
  for (const activity of version.activities || []) {
    const dates = buildDates(activity, version);
    for (const localDate of dates) {
      const scheduledFor = localDateTimeToUtc(
        localDate,
        activity.recurrence?.timeLocal || "09:00",
        version.timezone
      );
      const occurrenceKey = [
        String(carePlan._id),
        String(version._id),
        activity.activityKey,
        scheduledFor.toISOString(),
      ].join(":");

      let occurrence = await ScheduledOccurrence.findOne({ occurrenceKey });
      if (!occurrence) {
        occurrence = await ScheduledOccurrence.create({
          occurrenceKey,
          organization: carePlan.organization || null,
          program: carePlan.program || null,
          carePlan: carePlan._id,
          planVersion: version._id,
          patient: carePlan.patient,
          ownerDoctor: carePlan.ownerDoctor,
          activityKey: activity.activityKey,
          activityType: activity.type,
          title: activity.title,
          instructions: activity.instructions,
          sourceReport: activity.sourceReport || null,
          safetyText: activity.safetyText || version.safetyText || "",
          helpText: activity.helpText || version.helpText || "",
          activityConfig:
            activity.type === "activity"
              ? {
                  goalType: activity.activityConfig?.goalType || "steps",
                  goalValue: activity.activityConfig?.goalValue || 5000,
                }
              : undefined,
          scheduledFor,
          originalScheduledFor: scheduledFor,
          timezone: version.timezone,
          status: scheduledFor <= new Date() ? "due" : "scheduled",
        });
      }
      created.push(occurrence);
      if (occurrence.status === "due") {
        await markOccurrenceDue(occurrence._id);
      } else {
        await enqueueOccurrence(occurrence);
      }
    }
  }

  return created;
}

export async function markOccurrenceDue(occurrenceId, actor = { id: "scheduler", role: "system" }) {
  const occurrence = await ScheduledOccurrence.findById(occurrenceId).populate("patient");
  if (!occurrence) return { ignored: true, reason: "not_found" };
  if (["cancelled", "responded", "completed", "expired"].includes(occurrence.status)) {
    return { ignored: true, reason: occurrence.status };
  }

  occurrence.status = "due";
  await occurrence.save();

  const patient = occurrence.patient;
  const preference = await UserPreference.findOne({ userId: patient.userId }).lean();
  const optedIn = preference?.careQuestOptIn !== false && preference?.paused !== true;
  const deliveryKey = occurrence.occurrenceKey + ":in_app";

  if (optedIn) {
    await ReminderDelivery.findOneAndUpdate(
      { deliveryKey },
      {
        $setOnInsert: {
          occurrence: occurrence._id,
          patient: patient._id,
          channel: "in_app",
        },
        $set: { status: "sent", sentAt: new Date() },
        $inc: { attempts: 1 },
      },
      { upsert: true, new: true }
    );
    occurrence.deliveryStatus = "sent";
  } else {
    occurrence.deliveryStatus = "not_required";
  }
  await occurrence.save();

  try {
    await pusherServer.trigger(
      "private-carequest-user-" + patient.userId,
      "mission.updated",
      { occurrenceId: String(occurrence._id), status: "due" }
    );
  } catch {
    // Realtime is advisory. Clients refresh authoritative server state.
  }

  await appendAuditEvent({
    organizationId: occurrence.organization,
    programId: occurrence.program,
    actorUserId: actor.id,
    actorRole: actor.role,
    eventType: "mission.due",
    resourceType: "ScheduledOccurrence",
    resourceId: occurrence._id,
    verificationLevel: "system_confirmed",
    metadata: {
      organizationId: String(occurrence.organization || ""),
      programId: String(occurrence.program || ""),
      deliveryStatus: occurrence.deliveryStatus,
    },
  });

  return { success: true, deliveryStatus: occurrence.deliveryStatus };
}

export async function processDueOccurrences({ now = new Date(), limit = 100 } = {}) {
  const due = await ScheduledOccurrence.find({
    status: "scheduled",
    scheduledFor: { $lte: now },
  })
    .sort({ scheduledFor: 1 })
    .limit(limit);

  const results = [];
  for (const occurrence of due) {
    results.push(await markOccurrenceDue(occurrence._id));
  }
  return results;
}


export async function scheduleUpcomingWindow({ now = new Date(), limit = 200 } = {}) {
  const horizon = new Date(now.getTime() + QSTASH_FREE_DELAY_SECONDS * 1000);
  const occurrences = await ScheduledOccurrence.find({
    status: "scheduled",
    scheduledFor: { $gte: now, $lte: horizon },
    qstashMessageId: null,
  })
    .sort({ scheduledFor: 1 })
    .limit(limit);

  const results = [];
  for (const occurrence of occurrences) {
    results.push({
      occurrenceId: String(occurrence._id),
      ...(await enqueueOccurrence(occurrence)),
    });
  }
  return results;
}
