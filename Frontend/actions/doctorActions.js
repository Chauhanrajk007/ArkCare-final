"use server";

import { redirect } from "next/navigation";
import connectDB from "@/lib/db";
import Doctor from "@/models/Doctor";
import Patient from "@/models/Patient";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";
import {
  getBookableDoctorById,
} from "@/lib/doctorDirectory";
import {
  ensureCareQuestMembership,
} from "@/lib/carequest/permissions";
import { getSessionUser } from "@/lib/auth";

const HACKATHON_AUTO_APPROVE_DOCTORS = true; // HACKATHON_DEMO_REMOVE_AFTER_JUDGING

export async function createDoctorProfile(doctorData) {
  try {
    const user = await getSessionUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    if (user.role !== "doctor") {
      throw new Error("Doctor account required");
    }

    const experience = Number(doctorData.experience);
    const consultationFee = Number(doctorData.consultationFee);
    if (!Number.isFinite(experience) || experience < 0 || experience > 80) {
      throw new Error("Enter a valid experience value");
    }
    if (!Number.isFinite(consultationFee) || consultationFee < 0 || consultationFee > 100000) {
      throw new Error("Enter a valid consultation fee");
    }

    await connectDB();

    const userId = user._id.toString();

    const existingDoctor = await Doctor.findOne({ userId });
    if (existingDoctor) {
      throw new Error("A doctor profile already exists for this account");
    }

    const doctor = new Doctor({
      userId,
      name: doctorData.name || user.name,
      email: user.email,
      phone: doctorData.phone,
      specialization: doctorData.specialization,
      category: doctorData.category,
      experience,
      qualifications: doctorData.qualifications,
      consultationFee,
      availability: doctorData.availability,
      status: HACKATHON_AUTO_APPROVE_DOCTORS ? "approved" : "pending",
    });

    await doctor.save();

    await ensureCareQuestMembership(user, "doctor");

    redirect("/doctor");
  } catch (error) {
    // next/navigation redirect() intentionally throws NEXT_REDIRECT to terminate
    // the server action. Do not report a successful redirect as an application error.
    if (!String(error?.digest || "").startsWith("NEXT_REDIRECT")) {
      console.error("Error creating doctor profile:", error);
    }
    throw error;
  }
}


export async function getDoctorForBooking(recommendation) {
  const user = await getSessionUser();
  if (!user) throw new Error("User not authenticated");
  if (user.role !== "patient") throw new Error("Patient access required");

  await connectDB();

  const data =
    typeof recommendation === "string"
      ? { doctorId: recommendation }
      : recommendation || {};

  const patient = await Patient.findOne({
    userId: user._id.toString(),
  }).lean();
  if (!patient) throw new Error("Patient profile not found");

  const programContext = await getPrimaryProgramContext(patient);

  const doctor = await getBookableDoctorById({
    doctorId: data.doctorId,
    organizationId: programContext.organization._id,
  });

  if (!doctor) {
    throw new Error(
      "This doctor is no longer approved, assigned to your hospital, or bookable. Refresh the live doctor list."
    );
  }

  return JSON.parse(
    JSON.stringify({
      _id: doctor._id,
      name: doctor.name,
      specialization: doctor.specialization,
      category: doctor.category,
      consultationFee: doctor.consultationFee,
      experience: doctor.experience,
      phone: doctor.phone,
      qualifications: doctor.qualifications || [],
      availability: doctor.availability || [],
    })
  );
}
