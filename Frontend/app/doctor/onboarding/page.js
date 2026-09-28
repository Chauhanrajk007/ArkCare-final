import { requireRole } from "@/lib/auth";
import DoctorOnboarding from "@/components/DoctorOnboarding";

export default async function DoctorOnboardingPage() {
  await requireRole("doctor");

  return <DoctorOnboarding />;
}
