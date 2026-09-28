// app/api/upload-image/route.js
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import connectDB from "@/lib/db";
import Chat from "@/models/Chat";
import { getSessionUser } from "@/lib/auth";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Cloudinary rejects every request without a cloud name, and the SDK's own error
 * doesn't name the missing variable — so check before trying to upload.
 */
function assertCloudinaryConfigured() {
  const missing = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((name) => !process.env[name]);

  if (missing.length) {
    throw new Error(
      `Image upload is not configured: missing ${missing.join(", ")} in .env.local`
    );
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const chatId = formData.get("chatId");

    // Validate file
    if (!file || !chatId) {
      return NextResponse.json(
        { error: "File and chatId are required" },
        { status: 400 }
      );
    }

    if (!/^[0-9a-fA-F]{24}$/.test(chatId)) {
      return NextResponse.json(
        { error: "Invalid chatId" },
        { status: 400 }
      );
    }

    // Only a chat participant may upload into that chat's folder.
    await connectDB();

    const userId = user._id.toString();
    const chat = await Chat.findById(chatId).populate("doctorId patientId");

    const isParticipant =
      chat &&
      (chat.doctorId?.userId === userId || chat.patientId?.userId === userId);

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    assertCloudinaryConfigured();

    // File type validation
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images are allowed." },
        { status: 400 }
      );
    }

    // File size validation (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size too large. Maximum 5MB allowed." },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          folder: `chat-images/${chatId}`, // Organize by chat
          transformation: [
            { width: 800, height: 600, crop: "limit" }, // Limit max dimensions
            { quality: "auto" }, // Auto optimize quality
            { format: "auto" } // Auto format selection
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    return NextResponse.json({
      imageUrl: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
      success: true
    });

  } catch (error) {
    console.error("Image upload error:", error);

    // Configuration problems are actionable, so pass them through verbatim
    // instead of hiding them behind a generic message.
    const isConfigError = /not configured/i.test(error?.message || "");

    return NextResponse.json(
      { error: isConfigError ? error.message : "Failed to upload image" },
      { status: 500 }
    );
  }
}
