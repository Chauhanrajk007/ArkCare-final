"use server";

import connectDB from "@/lib/db";
import Chat from "@/models/Chat";
import Message from "@/models/Message";
import Appointment from "@/models/Appointment";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import { pusherServer } from "@/lib/pusher";
import { requireUser } from "@/lib/auth";

/** Resolve the sender's display name from their profile document. */
async function resolveSenderName(user) {
  const userId = user._id.toString();

  if (user.role === "doctor") {
    const doctor = await Doctor.findOne({ userId }).select("name").lean();
    if (doctor?.name) return doctor.name;
  } else {
    const patient = await Patient.findOne({ userId }).select("name").lean();
    if (patient?.name) return patient.name;
  }

  return user.name;
}

async function assertChatParticipant(chatId, userId) {
  if (!/^[0-9a-fA-F]{24}$/.test(String(chatId || ""))) {
    throw new Error("Invalid chat");
  }

  const chat = await Chat.findById(chatId).populate("doctorId patientId");
  if (!chat || !chat.doctorId || !chat.patientId) {
    throw new Error("Chat not found");
  }

  const hasAccess =
    chat.doctorId.userId === userId || chat.patientId.userId === userId;

  if (!hasAccess) {
    throw new Error("Unauthorized access");
  }

  return chat;
}

/**
 * Post a text message. The sender identity comes from the session cookie, never
 * from the client.
 */
export async function sendMessage(chatId, message) {
  try {
    const user = await requireUser();
    const senderId = user._id.toString();

    await connectDB();

    await assertChatParticipant(chatId, senderId);

    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) throw new Error("Message cannot be empty");
    if (cleanMessage.length > 4000) throw new Error("Message is too long");

    const senderName = await resolveSenderName(user);

    // Save message to database
    const newMessage = await Message.create({
      chatId,
      senderId,
      senderType: user.role,
      senderName,
      message: cleanMessage,
      messageType: "text",
    });

    // Send via Pusher - THIS IS KEY!
    await pusherServer.trigger(`private-chat-${chatId}`, "new-message", {
      _id: newMessage._id.toString(),
      chatId: newMessage.chatId,
      senderId: newMessage.senderId,
      senderType: newMessage.senderType,
      senderName: newMessage.senderName,
      message: newMessage.message,
      createdAt: newMessage.createdAt,
    });

    return JSON.parse(JSON.stringify(newMessage));
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

export async function createOrGetChat(appointmentId) {
  try {
    const user = await requireUser();
    const userId = user._id.toString();

    await connectDB();

    // Get appointment details
    const appointment = await Appointment.findById(appointmentId).populate(
      "doctor patient"
    );

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Check if doctor or patient data is missing
    if (!appointment.doctor || !appointment.patient) {
      throw new Error("Appointment has missing doctor or patient information");
    }

    // Check if user has access to this appointment
    const hasAccess =
      appointment.doctor.userId === userId ||
      appointment.patient.userId === userId;

    if (!hasAccess) {
      throw new Error("Unauthorized access");
    }

    // Check if appointment is confirmed
    if (appointment.status !== "confirmed") {
      throw new Error("Chat only available for confirmed appointments");
    }

    // Atomically resolve one chat room for the appointment. Patient and doctor
    // can open chat at the same instant; a plain find-then-create can race and
    // put them on different Pusher channels.
    let chat;
    try {
      chat = await Chat.findOneAndUpdate(
        { appointmentId },
        {
          $setOnInsert: {
            appointmentId,
            doctorId: appointment.doctor._id,
            patientId: appointment.patient._id,
            isActive: true,
            lastActivity: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
    } catch (error) {
      // If another request won the unique-index race, use the room it created.
      if (error?.code === 11000) {
        chat = await Chat.findOne({ appointmentId });
      } else {
        throw error;
      }
    }

    if (!chat) throw new Error("Could not initialize chat");

    return JSON.parse(JSON.stringify(chat));
  } catch (error) {
    console.error("Error creating/getting chat:", error);
    throw error;
  }
}

export async function getChatMessages(chatId) {
  try {
    const user = await requireUser();
    const userId = user._id.toString();

    await connectDB();

    // Verify access to chat
    const chat = await Chat.findById(chatId).populate("doctorId patientId");

    if (!chat) {
      throw new Error("Chat not found");
    }

    const hasAccess =
      chat.doctorId.userId === userId || chat.patientId.userId === userId;

    if (!hasAccess) {
      throw new Error("Unauthorized access");
    }

    // Get messages
    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .limit(100);

    return JSON.parse(JSON.stringify(messages));
  } catch (error) {
    console.error("Error getting chat messages:", error);
    throw error;
  }
}

export async function sendImageMessage(chatId, imageUrl, imagePublicId) {
  try {
    const user = await requireUser();
    const senderId = user._id.toString();

    await connectDB();

    await assertChatParticipant(chatId, senderId);

    const senderName = await resolveSenderName(user);

    const newMessage = await Message.create({
      chatId,
      senderId,
      senderType: user.role,
      senderName,
      imageUrl,
      imagePublicId,
      messageType: "image",
    });

    await pusherServer.trigger(`private-chat-${chatId}`, "new-message", {
      _id: newMessage._id.toString(),
      chatId: newMessage.chatId,
      senderId: newMessage.senderId,
      senderType: newMessage.senderType,
      senderName: newMessage.senderName,
      imageUrl: newMessage.imageUrl,
      messageType: newMessage.messageType,
      createdAt: newMessage.createdAt,
    });

    return JSON.parse(JSON.stringify(newMessage));
  } catch (error) {
    console.error("Error sending image message:", error);
    throw error;
  }
}
