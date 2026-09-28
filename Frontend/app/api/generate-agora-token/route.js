import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { RtcTokenBuilder, RtcRole } from "agora-access-token";
import { getSessionUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Chat from "@/models/Chat";

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { channelName, chatId, uid } = await request.json();

    if (
      typeof channelName !== "string" ||
      !channelName ||
      channelName.length > 64 ||
      !chatId ||
      !/^[0-9a-fA-F]{24}$/.test(chatId)
    ) {
      return NextResponse.json(
        { error: "Valid channel and chat are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const chat = await Chat.findById(chatId).populate("doctorId patientId");
    const userId = user._id.toString();
    const allowed =
      chat &&
      (chat.doctorId?.userId === userId || chat.patientId?.userId === userId);

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return NextResponse.json(
        { error: "Agora configuration missing" },
        { status: 500 }
      );
    }

    // Agora RTC project App IDs are the project credential copied from
    // Agora Console -> Project Management. A short numeric project/account ID
    // is not an RTC App ID and produces INVALID_VENDOR_KEY at client.join().
    if (!/^[0-9a-fA-F]{32}$/.test(appId)) {
      return NextResponse.json(
        {
          error:
            "AGORA_APP_ID is invalid. Copy the 32-character App ID from Agora Console -> Project Management. Do not use the numeric project/customer ID.",
          code: "INVALID_AGORA_APP_ID",
        },
        { status: 503 }
      );
    }

    if (!/^[0-9a-fA-F]{32}$/.test(appCertificate)) {
      return NextResponse.json(
        {
          error:
            "AGORA_APP_CERTIFICATE is invalid. Copy the 32-character Primary App Certificate from the same Agora Console project.",
          code: "INVALID_AGORA_CERTIFICATE",
        },
        { status: 503 }
      );
    }

    // Each participant requests their own short-lived token. Never ship the
    // other participant's RTC credential through Pusher.
    const rtcUid =
      Number.isInteger(uid) && uid > 0 && uid < 2_147_483_647
        ? uid
        : crypto.randomInt(1, 2_147_483_646);
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      rtcUid,
      RtcRole.PUBLISHER,
      expiresAt
    );

    return NextResponse.json({
      token,
      uid: rtcUid,
      channelName,
      appId,
      expiresAt,
    });
  } catch (error) {
    console.error("Agora token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate Agora token" },
      { status: 500 }
    );
  }
}
