import { requireRole } from "@/lib/auth";
import { getPatientMissionDashboard } from "@/actions/missionActions";
import { getCarePassport } from "@/actions/programActions";
import PatientMissionDashboard from "@/components/carequest/PatientMissionDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function CareQuestPatientPage() {
  await requireRole("patient");
  const [data, passport] = await Promise.all([
    getPatientMissionDashboard(),
    getCarePassport(),
  ]);

  return (
    <CareQuestShell
      role="patient"
      title="CareQuest"
      subtitle="Missions, hospital Capsules, benefits and human support"
    >
      <PatientMissionDashboard initialData={data} initialPassport={passport} />
    </CareQuestShell>
  );
}
