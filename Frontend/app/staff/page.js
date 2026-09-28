import { requireUser } from "@/lib/auth";
import { getHandoffQueue } from "@/actions/staffActions";
import StaffHandoffQueue from "@/components/carequest/StaffHandoffQueue";
import CareQuestShell from "@/components/carequest/CareQuestShell";
import { requireStaffMembership } from "@/lib/carequest/permissions";

export default async function StaffPage() {
  const user = await requireUser();
  if (!["nurse", "coordinator"].includes(user.role)) {
    throw new Error("CareQuest staff access required");
  }
  const membership = await requireStaffMembership(user, [
    "nurse",
    "coordinator",
  ]);
  const cases = await getHandoffQueue();

  return (
    <CareQuestShell
      role="staff"
      title="Handoff queue"
      subtitle="Own the exception, document the contact, escalate when needed"
    >
      <StaffHandoffQueue
        initialCases={cases}
        role={user.role}
        organizationId={membership.organization._id.toString()}
      />
    </CareQuestShell>
  );
}
