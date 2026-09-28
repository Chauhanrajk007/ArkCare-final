import { pusherServer } from "@/lib/pusher";

export async function emitCareQuestStaff(
  organizationId,
  event,
  data = {}
) {
  if (!organizationId) return false;
  try {
    await pusherServer.trigger(
      "private-carequest-staff-" + String(organizationId),
      event,
      data
    );
    return true;
  } catch {
    return false;
  }
}

export async function emitCareQuestUser(userId, event, data = {}) {
  if (!userId) return false;
  try {
    await pusherServer.trigger(
      "private-carequest-user-" + String(userId),
      event,
      data
    );
    return true;
  } catch {
    return false;
  }
}
