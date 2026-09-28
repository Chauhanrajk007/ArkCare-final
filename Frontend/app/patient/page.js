import { requireRole } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import PatientDashboard from "@/components/PatientDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";
import { getApprovedDoctorDirectory } from "@/lib/doctorDirectory";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";

export default async function PatientPage() {
  const user = await requireRole("patient");

  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() });
  if (!patient) throw new Error("Patient profile not found");

  const context = await getPrimaryProgramContext(patient);
  const doctors = await getApprovedDoctorDirectory({
    organizationId: context.organization._id,
  });

  return (
    <CareQuestShell
      role="patient"
      title="Care home"
      subtitle="Appointments, doctors, reports and your ongoing CareQuest journey"
    >
      <PatientDashboard doctors={doctors} />
    </CareQuestShell>
  );
}
