import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Chat from "@/models/Chat";
import CareQuestMembership from "@/models/CareQuestMembership";
import { getSessionUser } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const socketId = formData.get("socket_id");
    const channelName = formData.get("channel_name");

    if (typeof socketId !== "string" || typeof channelName !== "string") {
      return NextResponse.json({ error: "Invalid channel request" }, { status: 400 });
    }

    await connectDB();
    const userId = user._id.toString();

    if (channelName.startsWith("private-carequest-user-")) {
      const targetUserId = channelName.slice("private-carequest-user-".length);
      if (targetUserId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json(pusherServer.authorizeChannel(socketId, channelName));
    }

    if (channelName.startsWith("private-carequest-staff-")) {
      if (!["doctor", "nurse", "coordinator"].includes(user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const organizationId = channelName.slice(
        "private-carequest-staff-".length
      );
      if (!/^[0-9a-fA-F]{24}$/.test(organizationId)) {
        return NextResponse.json(
          { error: "Invalid organization channel" },
          { status: 400 }
        );
      }

      const membership = await CareQuestMembership.findOne({
        user: user._id,
        organization: organizationId,
        active: true,
        role: user.role,
      }).lean();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json(
        pusherServer.authorizeChannel(socketId, channelName)
      );
    }

    if (!channelName.startsWith("private-chat-")) {
      return NextResponse.json({ error: "Invalid channel request" }, { status: 400 });
    }

    const chatId = channelName.slice("private-chat-".length);
    if (!/^[0-9a-fA-F]{24}$/.test(chatId)) {
      return NextResponse.json({ error: "Invalid chat" }, { status: 400 });
    }

    const chat = await Chat.findById(chatId).populate("doctorId patientId");
    const allowed =
      chat &&
      (chat.doctorId?.userId === userId || chat.patientId?.userId === userId);

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(pusherServer.authorizeChannel(socketId, channelName));
  } catch (error) {
    console.error("Pusher authorization failed:", error);
    return NextResponse.json({ error: "Could not authorize channel" }, { status: 500 });
  }
}
