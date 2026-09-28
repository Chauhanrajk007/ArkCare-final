import { requireRole } from "@/lib/auth";
import { getPlatformConsole } from "@/actions/hospitalActions";
import PlatformConsole from "@/components/carequest/PlatformConsole";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function PlatformAdminPage() {
  await requireRole("platform_admin");
  const overview = await getPlatformConsole();

  return (
    <CareQuestShell
      role="platform_admin"
      title="Master console"
      subtitle="Every hospital, its reputation, and where every audit went"
    >
      <PlatformConsole overview={overview} />
    </CareQuestShell>
  );
}
