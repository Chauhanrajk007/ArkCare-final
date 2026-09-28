import { requireRole } from "@/lib/auth";
import { getPatientApprovedCarePlans } from "@/actions/carePlanActions";
import PatientCarePlans from "@/components/carequest/PatientCarePlans";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function PatientCarePlansPage() {
  await requireRole("patient");
  const plans = await getPatientApprovedCarePlans();

  return (
    <CareQuestShell
      role="patient"
      title="Approved care plan"
      subtitle="Only clinician-approved versions are visible here"
    >
      <PatientCarePlans plans={plans} />
    </CareQuestShell>
  );
}
