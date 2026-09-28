"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDoctorReportWorkspace } from "@/actions/reportActions";
import { Building2, Link2, Loader2, Pill, RefreshCw, ShieldCheck, Stethoscope, Users } from "lucide-react";

/**
 * The doctor's "patients I've seen" workspace: every patient they interacted
 * with, the reports/remarks they filed, and a per-patient activity dashboard
 * (missions completed/due + Capsules earned). Shows the on-chain status of each
 * report so the doctor can see what is provable.
 */
export default function DoctorReportsPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(await getDoctorReportWorkspace());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return (
      <div className="cq-card p-6 text-sm text-muted-foreground">
        {error ? error : "Loading patient reports…"}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="cq-card cq-reveal p-5 md:p-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="cq-kicker">MY PATIENTS</div>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-black">
              <Users className="h-5 w-5 text-primary" /> Reports &amp; activity
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.totals.patients} patients · {data.totals.reports} reports filed ·{" "}
              {data.totals.capsulesOnChain} capsules earned by your patients
            </p>
            {data.hospital?.name ? (
              <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs">
                <span className="cq-pixel-label">
                  <Building2 className="mr-1 h-3 w-3" /> {data.hospital.name}
                </span>
                <span className="cq-pixel-label cq-real-label">
                  reputation {data.hospital.reputationScore}/100 · {data.hospital.reputationLabel}
                </span>
                <Link
                  href="/patient/hospitals"
                  className="font-semibold text-primary hover:underline"
                >
                  check hospital reputation
                </Link>
              </p>
            ) : null}
          </div>
          <Button variant="outline" onClick={load} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.patients.map((patient) => {
          const patientReports = data.reports.filter(
            (r) => r.patientId === patient.patientId
          );
          return (
            <article key={patient.patientId} className="cq-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    <h3 className="text-lg font-bold">{patient.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {patient.reports} report{patient.reports === 1 ? "" : "s"} ·{" "}
                    {patient.medications} medication
                    {patient.medications === 1 ? "" : "s"} recorded
                    {patient.anchored > 0
                      ? ` · ${patient.anchored} on-chain`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                  <div className="text-lg font-black">{patient.missionsCompleted}</div>
                  <div className="text-[10px] text-muted-foreground">missions done</div>
                </div>
                <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                  <div className="text-lg font-black">{patient.missionsDue}</div>
                  <div className="text-[10px] text-muted-foreground">due now</div>
                </div>
                <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                  <div className="text-lg font-black">{patient.capsulesEarned}</div>
                  <div className="text-[10px] text-muted-foreground">capsules</div>
                </div>
              </div>

              {patientReports.length ? (
                <div className="mt-3 space-y-2">
                  {patientReports.map((report) => (
                    <div
                      key={report._id}
                      className="rounded-lg border border-border bg-white p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">rev {report.revision}</span>
                        {report.blockchain?.status === "anchored" ? (
                          <span className="cq-pixel-label cq-real-label">
                            <Link2 className="mr-1 h-3 w-3" /> on-chain
                          </span>
                        ) : (
                          <Badge variant="outline">
                            {report.blockchain?.status || "pending"}
                          </Badge>
                        )}
                        {report.aiNeedsReview ? (
                          <Badge variant="outline">needs review</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        <span>consulted {report.patientName || "patient"}</span>
                        {report.hospitalName ? (
                          <>
                            <span>· at {report.hospitalName}</span>
                            {typeof report.hospitalReputationScore === "number" ? (
                              <span className="cq-pixel-label cq-real-label">
                                rep {report.hospitalReputationScore}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      {report.remarkSummary || report.clinicalSummary ? (
                        <p className="mt-1 text-muted-foreground">
                          {report.remarkSummary || report.clinicalSummary?.slice(0, 120)}
                        </p>
                      ) : null}
                      {report.medications?.length ? (
                        <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                          <Pill className="h-3 w-3" />
                          {report.medications
                            .map((m) => m.name + (m.dose ? ` ${m.dose}` : ""))
                            .join(", ")}
                        </div>
                      ) : null}
                      <div className="mt-1 break-all font-mono text-[9px] text-muted-foreground">
                        {report.contentHash?.slice(0, 20)}…
                        {report.blockchain?.txHash
                          ? ` · tx ${report.blockchain.txHash.slice(0, 10)}…`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No reports filed yet for this patient.
                </p>
              )}
            </article>
          );
        })}
      </div>

      {data.patients.length === 0 ? (
        <div className="cq-card border-dashed p-8 text-center text-sm text-muted-foreground">
          You have not interacted with any patients yet.
        </div>
      ) : null}

      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Each report is content-hashed and anchored on the local chain, so a filed
        prescription or remark cannot be later denied. The activity dashboard is a
        view of the patient&apos;s engagement, not a clinical score.
      </p>
    </section>
  );
}
