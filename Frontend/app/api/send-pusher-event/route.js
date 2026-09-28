import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";
import connectDB from "@/lib/db";
import Chat from "@/models/Chat";
import { getSessionUser } from "@/lib/auth";

const PUSHER_EVENTS = new Set([
  "call-initiated",
  "call-accepted",
  "call-declined",
  "call-ended",
  "call-response",
]);

/** True when the signed-in user is one of the two chat participants. */
async function isChatParticipant(chatId, userId) {
  const chat = await Chat.findById(chatId).populate("doctorId patientId");

  if (!chat) return false;

  return (
    chat.doctorId?.userId === userId || chat.patientId?.userId === userId
  );
}

export async function POST(request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channel, event, data } = await request.json();

    if (typeof channel !== "string" || !channel.startsWith("private-chat-")) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!PUSHER_EVENTS.has(event)) {
      return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
    }

    const chatId = channel.slice("private-chat-".length);
    if (!/^[0-9a-fA-F]{24}$/.test(chatId)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    // Never let one user broadcast into another user's chat room.
    await connectDB();

    const userId = user._id.toString();
    if (!(await isChatParticipant(chatId, userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await pusherServer.trigger(channel, event, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher event error:", error);
    return NextResponse.json(
      { error: "Failed to send event" },
      { status: 500 }
    );
  }
}
