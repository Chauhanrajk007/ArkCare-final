import { requireUser } from "@/lib/auth";
import { getHospitalsDirectory } from "@/actions/hospitalActions";
import HospitalDirectory from "@/components/carequest/HospitalDirectory";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function HospitalsPage() {
  await requireUser();
  const hospitals = await getHospitalsDirectory();

  return (
    <CareQuestShell
      role="patient"
      title="Hospitals"
      subtitle="Every CareQuest hospital, its reputation and its independent audit"
    >
      <HospitalDirectory hospitals={hospitals} />
    </CareQuestShell>
  );
}
