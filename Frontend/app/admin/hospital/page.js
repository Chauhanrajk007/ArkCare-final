import { requireRole } from "@/lib/auth";
import { getMyHospitalProfile } from "@/actions/hospitalActions";
import HospitalProfileCard from "@/components/carequest/HospitalProfileCard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function MyHospitalPage() {
  await requireRole("hospital_admin");
  const profile = await getMyHospitalProfile();

  return (
    <CareQuestShell
      role="admin"
      title="My hospital"
      subtitle="Your hospital's reputation, patients and independent audit"
    >
      <HospitalProfileCard profile={profile} />
    </CareQuestShell>
  );
}
