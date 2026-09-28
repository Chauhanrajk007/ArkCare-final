"use server";

import crypto from "node:crypto";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Patient from "@/models/Patient";
import Doctor from "@/models/Doctor";
import { createSession } from "@/lib/auth";
import { ensureCareQuestMembership } from "@/lib/carequest/permissions";
import { ensureDemoHospitalPrograms } from "@/lib/carequest/programs";

/**
 * HACKATHON_DEMO_ACCESS
 * --------------------
 * Judges use these one-click accounts from main.
 *
 * HACKATHON_DEMO_REMOVE_AFTER_JUDGING:
 * 1. set HACKATHON_DEMO_MODE=false,
 * 2. remove <InstantSignIn /> from RoleSelection + sign-in,
 * 3. delete this file.
 *
 * Demo accounts are synthetic and must never contain real patient data.
 */
const HACKATHON_DEMO_MODE = true;
const VALID_ROLES = ["patient", "doctor", "nurse", "coordinator", "hospital_admin"];

const DEMO_DOCTOR = {
  name: "Dr. Aisha Rahman",
  specialization: "Cardiology",
  category: "cardiology",
  experience: 12,
  qualifications: ["MBBS", "MD (Medicine)", "DM (Cardiology)"],
  consultationFee: 1200,
  phone: "+91 98000 00001",
};

function buildAvailability() {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
    day,
    slots: ["10:00", "11:00", "12:00", "16:00", "17:00"],
  }));
}

async function ensureDemoUser(role) {
  const email = `demo.${role}@arkcare.local`;
  let user = await User.findOne({ email });

  if (!user) {
    const password = crypto.randomBytes(24).toString("base64url");
    const names = {
      doctor: DEMO_DOCTOR.name,
      patient: "Demo Patient",
      nurse: "Nurse Meera Singh",
      coordinator: "Care Coordinator Arjun",
      hospital_admin: "Hospital Admin",
    };
    user = await User.register({
      name: names[role] || "CareQuest Demo User",
      email,
      password,
      gender: "other",
    });
  }

  if (user.role !== role) {
    user.role = role;
    await user.save();
  }

  return user;
}

async function ensurePatientProfile(user) {
  const userId = user._id.toString();
  return (
    (await Patient.findOne({ userId })) ||
    Patient.create({
      userId,
      name: user.name,
      email: user.email,
      gender: user.gender || "other",
    })
  );
}

async function ensureDoctorProfile(user) {
  const userId = user._id.toString();
  const existing = await Doctor.findOne({ userId });

  if (existing) {
    if (existing.status !== "approved") {
      existing.status = "approved";
      await existing.save();
    }
    return existing;
  }

  return Doctor.create({
    userId,
    name: DEMO_DOCTOR.name,
    email: user.email,
    ...DEMO_DOCTOR,
    availability: buildAvailability(),
    status: "approved",
  });
}

async function ensureHackathonDemoWorld() {
  const [patientUser, doctorUser, nurseUser, coordinatorUser, adminUser] =
    await Promise.all([
      ensureDemoUser("patient"),
      ensureDemoUser("doctor"),
      ensureDemoUser("nurse"),
      ensureDemoUser("coordinator"),
      ensureDemoUser("hospital_admin"),
    ]);

  const [patientProfile] = await Promise.all([
    ensurePatientProfile(patientUser),
    ensureDoctorProfile(doctorUser),
  ]);

  await Promise.all([
    ensureCareQuestMembership(doctorUser, "doctor"),
    ensureCareQuestMembership(nurseUser, "nurse"),
    ensureCareQuestMembership(coordinatorUser, "coordinator"),
    ensureCareQuestMembership(adminUser, "hospital_admin"),
    ensureDemoHospitalPrograms(patientProfile),
  ]);

  return { patientUser, doctorUser, nurseUser, coordinatorUser, adminUser };
}

export async function instantSignInAs(role) {
  if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");
  if (!HACKATHON_DEMO_MODE) throw new Error("Hackathon demo access is disabled.");

  await connectDB();

  // Seed both sides regardless of which judge button is clicked first, so the
  // patient demo always has a bookable doctor and vice versa.
  const world = await ensureHackathonDemoWorld();
  const byRole = {
    patient: world.patientUser,
    doctor: world.doctorUser,
    nurse: world.nurseUser,
    coordinator: world.coordinatorUser,
    hospital_admin: world.adminUser,
  };
  const user = byRole[role];

  await createSession(user);
  return { success: true, role };
}
