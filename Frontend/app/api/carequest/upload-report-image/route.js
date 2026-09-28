import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getSessionUser } from "@/lib/auth";
import connectDB from "@/lib/db";
import Doctor from "@/models/Doctor";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 8 * 1024 * 1024;

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

/**
 * Store a prescription/report image for a doctor's consultation report.
 * Doctor-only: the image is later OCR'd and its content is anchored on-chain
 * as part of the report, so it must only be uploadable by an approved doctor.
 */
export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "doctor") {
      return NextResponse.json(
        { error: "Doctor access required" },
        { status: 403 }
      );
    }

    await connectDB();
    const doctor = await Doctor.findOne({ userId: user._id.toString() }).lean();
    if (!doctor || doctor.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved doctors can attach prescription images" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !file.name) {
      return NextResponse.json(
        { error: "An image file is required" },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG or WEBP prescription images are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image is larger than 8MB" },
        { status: 400 }
      );
    }

    assertCloudinaryConfigured();

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "image",
            folder: "prescriptions",
            transformation: [
              { width: 1600, height: 1600, crop: "limit" },
              { quality: "auto" },
              { format: "auto" },
            ],
          },
          (error, result) => (error ? reject(error) : resolve(result))
        )
        .end(buffer);
    });

    return NextResponse.json({
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
      fileName: file.name,
      success: true,
    });
  } catch (error) {
    const isConfigError = /not configured/i.test(error?.message || "");
    return NextResponse.json(
      { error: isConfigError ? error.message : "Failed to upload image" },
      { status: 500 }
    );
  }
}
