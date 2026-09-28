import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
  senderId: { type: String, required: true },
  senderType: { type: String, enum: ["doctor", "patient"], required: true },
  senderName: { type: String, required: true },
  messageType: { 
    type: String, 
    enum: ["text", "image"], 
    default: "text" 
  },
  message: { type: String }, // For text messages
  imageUrl: { type: String }, // For image messages
  imagePublicId: { type: String }, // For Cloudinary public_id (needed for deletion)
}, { timestamps: true });

export default mongoose.models.Message || mongoose.model("Message", MessageSchema);
