import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import connectDB from "@/lib/db";
import Doctor from "@/models/Doctor";
import DoctorDashboard from "@/components/DoctorDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function DoctorPage() {
  const user = await requireRole("doctor");
  await connectDB();
  const doctor = await Doctor.findOne({ userId: user._id.toString() }).lean();

  if (!doctor) redirect("/doctor/onboarding");

  return (
    <CareQuestShell
      role="doctor"
      title="Clinical workspace"
      subtitle="Appointments, consultations and care continuity"
    >
      <DoctorDashboard doctor={JSON.parse(JSON.stringify(doctor))} />
    </CareQuestShell>
  );
}
