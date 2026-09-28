import { requireRole } from "@/lib/auth";
import { getAuditOverview } from "@/actions/auditActions";
import AuditDashboard from "@/components/carequest/AuditDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function AuditPage() {
  await requireRole("hospital_admin");
  const data = await getAuditOverview();

  return (
    <CareQuestShell
      role="admin"
      title="Audit & integrity"
      subtitle="Append-only provenance and on-chain commitments"
    >
      <AuditDashboard initialData={data} />
    </CareQuestShell>
  );
}
