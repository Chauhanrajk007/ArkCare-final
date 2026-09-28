import { FileText, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import PDFUploader from "@/components/PDFUploader";
import CareQuestShell from "@/components/carequest/CareQuestShell";
import PixelCharacter from "@/components/carequest/PixelCharacter";

export default async function ReportsPage() {
  await requireRole("patient");

  return (
    <CareQuestShell
      role="patient"
      title="Medical reports"
      subtitle="Authenticated report processing and clinician-review inputs"
    >
      <div className="space-y-6 pb-24 lg:pb-4">
        <section className="cq-card p-5 md:p-6">
          <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="cq-pixel-label">REPORT INTELLIGENCE</span>
                <span className="cq-pixel-label cq-real-label">PRIVATE SESSION</span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight">Medical Report Lab</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Convert lab PDFs into structured results and patient-friendly summaries.
                AI output is supporting information; CareQuest plan publication remains
                clinician-controlled.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <FileText className="h-4 w-4 text-primary" />
                Uploaded reports use the authenticated ArkCare session.
              </div>
            </div>
            <PixelCharacter
              variant="guide"
              mood="idle"
              size={82}
              speech="Reports can help a doctor draft—not auto-publish—your care plan."
            />
          </div>
        </section>

        <div className="rounded-xl border border-[#ded8e8] bg-[#f3f0f6] px-4 py-3 text-xs leading-5 text-[#665f79]">
          <Sparkles className="mr-2 inline h-4 w-4" />
          CareQuest AI drafts are review-only and never become patient-facing without
          explicit doctor approval.
        </div>

        <PDFUploader />
      </div>
    </CareQuestShell>
  );
}
