import { requireRole } from "@/lib/auth";
import { getDoctorCarePlanWorkspace } from "@/actions/carePlanActions";
import DoctorCarePlanWorkspace from "@/components/carequest/DoctorCarePlanWorkspace";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function DoctorCarePlansPage() {
  await requireRole("doctor");
  const data = await getDoctorCarePlanWorkspace();

  return (
    <CareQuestShell
      role="doctor"
      title="Care plans"
      subtitle="Draft, review and explicitly approve versioned patient plans"
    >
      <DoctorCarePlanWorkspace initialData={data} />
    </CareQuestShell>
  );
}
