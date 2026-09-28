import { requireRole } from "@/lib/auth";
import { getHandoffQueue } from "@/actions/staffActions";
import StaffHandoffQueue from "@/components/carequest/StaffHandoffQueue";
import CareQuestShell from "@/components/carequest/CareQuestShell";
import { ensureCareQuestMembership } from "@/lib/carequest/permissions";

export default async function DoctorEscalationsPage() {
  const user = await requireRole("doctor");
  const membership = await ensureCareQuestMembership(user, "doctor");
  if (!membership?.active) {
    throw new Error("Active hospital membership required");
  }
  const cases = await getHandoffQueue();

  return (
    <CareQuestShell
      role="doctor"
      title="Clinical escalations"
      subtitle="Only exception cases requiring doctor review"
    >
      <StaffHandoffQueue
        initialCases={cases}
        role="doctor"
        organizationId={membership.organization._id.toString()}
      />
    </CareQuestShell>
  );
}
