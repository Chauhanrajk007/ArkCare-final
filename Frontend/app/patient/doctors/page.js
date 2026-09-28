import { requireRole } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import { getApprovedDoctorDirectory } from "@/lib/doctorDirectory";
import { getPrimaryProgramContext } from "@/lib/carequest/programs";
import DoctorDirectory from "@/components/carequest/DoctorDirectory";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function PatientDoctorsPage() {
  const user = await requireRole("patient");
  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() }).lean();
  const context = patient ? await getPrimaryProgramContext(patient) : null;

  const doctors = await getApprovedDoctorDirectory({
    organizationId: context?.organization?._id || null,
  });

  return (
    <CareQuestShell
      role="patient"
      title="Doctors"
      subtitle="Browse every clinician by their niche, then book to start a video consultation"
    >
      <DoctorDirectory
        doctors={doctors}
        organizationName={context?.organization?.name || ""}
      />
    </CareQuestShell>
  );
}
