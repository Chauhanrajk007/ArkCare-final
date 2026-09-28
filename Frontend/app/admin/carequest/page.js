import { requireRole } from "@/lib/auth";
import { getServiceImprovementDashboard } from "@/actions/dashboardActions";
import ServiceImprovementDashboard from "@/components/carequest/ServiceImprovementDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function CareQuestAdminPage() {
  await requireRole("hospital_admin");
  const data = await getServiceImprovementDashboard();

  return (
    <CareQuestShell
      role="admin"
      title="CareQuest program"
      subtitle="Engagement, operations, rewards, finance and simulated future compute"
    >
      <ServiceImprovementDashboard data={data} />
    </CareQuestShell>
  );
}
