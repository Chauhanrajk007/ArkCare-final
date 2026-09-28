import { requireUser } from "@/lib/auth";
import { getNetworkAccounts } from "@/actions/networkAccountsActions";
import NetworkAccounts from "@/components/carequest/NetworkAccounts";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function NetworkAccountsPage() {
  await requireUser();
  const accounts = await getNetworkAccounts();

  return (
    <CareQuestShell
      role="patient"
      title="Network directory"
      subtitle="Enter any hospital or doctor dashboard in the network"
    >
      <NetworkAccounts accounts={accounts} />
    </CareQuestShell>
  );
}
