import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import HealthScoreDashboard from "@/components/HealthScoreDashboard";
import CareQuestShell from "@/components/carequest/CareQuestShell";

export default async function HealthPage() {
  const user = await requireRole("patient");

  await connectDB();
  const patient = await Patient.findOne({ userId: user._id.toString() }).lean();
  if (!patient) redirect("/patient");

  return (
    <CareQuestShell
      role="patient"
      title="Health insights"
      subtitle="Existing ArkCare insight tools, separate from CareQuest participation scoring"
    >
      <HealthScoreDashboard patient={JSON.parse(JSON.stringify(patient))} />
    </CareQuestShell>
  );
}
