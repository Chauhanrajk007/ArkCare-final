"use client";

import { Button } from "@/components/ui/button";
import ReportQuizCard from "@/components/carequest/ReportQuizCard";
import { Link2, Pill, ShieldCheck, Stethoscope } from "lucide-react";

/**
 * "Doctors visited" + report-derived activities for the patient's CareQuest
 * page. Each card shows the consulting doctor, their remarks, the prescription
 * they recorded, the on-chain proof, and the knowledge check.
 *
 * Open state is controlled by the parent so a mission can deep-link here.
 */
export default function PatientReportsTimeline({
  reports,
  openId,
  onOpenReport,
  onChanged,
}) {
  if (!reports || !reports.length) return null;

  return (
    <section className="space-y-4" id="carequest-reports">
      <div>
        <div className="cq-kicker">DOCTORS VISITED</div>
        <h2 className="mt-1 text-2xl font-black">Your consultation reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every report is recorded by your doctor, anchored on the local chain, and
          turned into your daily activities.
        </p>
      </div>

      {reports.map((report) => {
        const expanded = openId === report._id;
        return (
          <article key={report._id} className="cq-card p-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cq-pixel-label">
                    <Stethoscope className="mr-1 h-3 w-3" />
                    {report.doctorName || "Doctor"}
                  </span>
                  {report.doctorSpecialization ? (
                    <span className="cq-pixel-label">{report.doctorSpecialization}</span>
                  ) : null}
                  {report.appointmentDate ? (
                    <span className="cq-pixel-label">
                      {new Date(report.appointmentDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-lg font-bold">
                  {report.remarkSummary || "Consultation summary"}
                </h3>
                {report.followUpWindow ? (
                  <p className="mt-1 text-xs font-semibold text-primary">
                    Follow-up advised: {report.followUpWindow}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {report.blockchain?.status === "anchored" ? (
                  <span className="cq-pixel-label cq-real-label">
                    <Link2 className="mr-1 h-3 w-3" />
                    on-chain
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenReport?.(expanded ? null : report._id)}
                >
                  {expanded ? "Hide" : "View report"}
                </Button>
              </div>
            </div>

            {expanded ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                {report.medications?.length ? (
                  <div>
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <Pill className="h-3.5 w-3.5" /> Prescription
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {report.medications.map((med, index) => (
                        <li key={index}>
                          • {med.name}
                          {med.dose ? ` · ${med.dose}` : ""}
                          {med.frequency ? ` · ${med.frequency}` : ""}
                          {med.duration ? ` · ${med.duration}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {report.patientActivity ? (
                  <div>
                    <div className="text-xs font-bold">Activity your doctor advised</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {report.patientActivity}
                    </p>
                  </div>
                ) : null}

                {report.conditions?.length ? (
                  <div>
                    <div className="text-xs font-bold">Conditions on your report</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {report.conditions.map((c) => c.label).join(", ")}
                    </div>
                  </div>
                ) : null}

                {report.images?.length ? (
                  <div>
                    <div className="text-xs font-bold">Attached documents</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {report.images.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="cq-pixel-label"
                        >
                          View
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  Report proof: {report.contentHash?.slice(0, 18)}…{" "}
                  {report.blockchain?.txHash
                    ? `· tx ${report.blockchain.txHash.slice(0, 12)}…`
                    : ""}
                </div>

                <ReportQuizCard report={report} onCompleted={onChanged} />
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
