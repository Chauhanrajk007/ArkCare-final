import { CalendarDays, ShieldCheck, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PixelCharacter from "@/components/carequest/PixelCharacter";

export default function PatientCarePlans({ plans }) {
  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="cq-pixel-label cq-real-label">DOCTOR APPROVED</span>
              <span className="cq-pixel-label">READ ONLY</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">My CareQuest Plan</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Only the current clinician-approved version appears here. Drafts, rejected
              revisions and AI suggestions remain private until a doctor explicitly
              approves them.
            </p>
          </div>
          <PixelCharacter
            variant="guide"
            mood="idle"
            size={86}
            speech="This is the plan your clinician approved."
          />
        </div>
      </section>

      {plans.length === 0 ? (
        <section className="cq-card flex items-center gap-4 border-dashed p-8">
          <PixelCharacter variant="guide" mood="idle" size={64} />
          <div>
            <h2 className="font-bold">No approved care plan yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts and rejected versions are never shown in the patient view.
            </p>
          </div>
        </section>
      ) : (
        plans.map((plan) => {
          const version = plan.approvedVersion;
          return (
            <article key={plan._id} className="cq-card overflow-hidden">
              <div className="border-b border-border bg-[#fafbf8] p-5 md:p-6">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {plan.organization?.name ? (
                        <span className="cq-pixel-label">
                          {plan.organization.name}
                          {plan.program?.capsuleSymbol
                            ? " · " + plan.program.capsuleSymbol
                            : ""}
                        </span>
                      ) : null}
                      <span className="cq-pixel-label cq-real-label">
                        <ShieldCheck className="h-3 w-3" />
                        APPROVED V{version.versionNumber}
                      </span>
                      <Badge variant="outline">{plan.status}</Badge>
                    </div>
                    <h2 className="mt-4 text-2xl font-black">{version.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {version.summary || "Clinician-approved continuity plan"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3 text-sm">
                    <div className="flex items-center gap-2 font-bold">
                      <Stethoscope className="h-4 w-4 text-primary" />
                      {plan.ownerDoctor?.name || "Care team"}
                    </div>
                    {plan.ownerDoctor?.specialization ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {plan.ownerDoctor.specialization}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-6">
                <div className="grid gap-3 rounded-xl border border-border bg-white p-4 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Valid from</div>
                    <div className="mt-1 font-bold">
                      {new Date(version.validFrom).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Valid to</div>
                    <div className="mt-1 font-bold">
                      {version.validTo
                        ? new Date(version.validTo).toLocaleDateString()
                        : "Until clinician revision"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Time zone</div>
                    <div className="mt-1 font-bold">{version.timezone}</div>
                  </div>
                </div>

                {version.safetyText ? (
                  <div className="mt-4 rounded-xl border border-[#eadab7] bg-warning-soft p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-warning">
                      Safety
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {version.safetyText}
                    </p>
                  </div>
                ) : null}

                <div className="mt-6">
                  <div className="cq-kicker">PLAN ACTIVITIES</div>
                  <div className="mt-3 space-y-3">
                    {(version.activities || []).map((activity, index) => (
                      <section
                        key={activity.activityKey}
                        className="rounded-xl border border-border bg-[#fafbf8] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft font-mono text-xs font-black text-primary">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{activity.type}</Badge>
                              <h3 className="font-bold">{activity.title}</h3>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {activity.instructions}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {activity.recurrence?.kind || "once"}
                              </span>
                              {activity.recurrence?.timeLocal ? (
                                <span>
                                  {activity.recurrence.timeLocal} {version.timezone}
                                </span>
                              ) : null}
                            </div>
                            {activity.helpText ? (
                              <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2 text-xs leading-5 text-primary">
                                {activity.helpText}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                {version.helpText ? (
                  <div className="mt-5 rounded-xl border border-[#d3dfd8] bg-primary-soft p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-primary">
                      Need help?
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {version.helpText}
                    </p>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
