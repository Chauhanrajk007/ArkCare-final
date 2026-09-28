import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BellRing,
  Building2,
  Clock3,
  Coins,
  Gift,
  HeartHandshake,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import SimulationBadge from "@/components/carequest/SimulationBadge";

function Metric({ label, value, note, icon: Icon = Activity }) {
  return (
    <div className="cq-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-mono text-[10px] font-bold text-muted-foreground">LIVE</span>
      </div>
      <div className="mt-5 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-sm font-bold">{label}</div>
      {note ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function SectionTitle({ kicker, title, text, badge = null }) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <div className="cq-kicker">{kicker}</div>
        <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
        {text ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{text}</p> : null}
      </div>
      {badge}
    </div>
  );
}

export default function ServiceImprovementDashboard({ data }) {
  const m = data.metrics;
  const r = data.rewards;
  const f = data.finance;
  const s = data.simulation;

  return (
    <div className="space-y-7 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal overflow-hidden p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="cq-pixel-label">AGGREGATE HOSPITAL VIEW</span>
              <span className="cq-pixel-label cq-real-label">TENANT SCOPED</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">
              CareQuest service improvement
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {data.organization?.name || "Hospital"} sees operational continuity,
              reward-program obligations and recorded payment evidence as separate
              systems. Patient identity is not required on this aggregate screen.
            </p>
            <Link
              href="/admin/carequest/audit"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              Audit & blockchain proof
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <PixelCharacter
            variant="guardian"
            mood={m.overdue > 0 ? "alert" : "idle"}
            size={96}
            speech={m.overdue > 0 ? m.overdue + " overdue handoff(s) need attention." : "Program systems look calm."}
          />
        </div>
      </section>

      <section>
        <SectionTitle
          kicker="ENGAGEMENT"
          title="Care continuity"
          text="Participation and follow-up signals from this hospital only. These measures are not clinical quality scores."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Users} label="Enrolled patients" value={m.enrolledPatients} />
          <Metric
            icon={Activity}
            label="Mission response rate"
            value={m.responseRate + "%"}
            note={data.definitions.responseRate}
          />
          <Metric icon={WalletCards} label="Missions" value={m.totalOccurrences} />
          <Metric icon={HeartHandshake} label="Follow-ups completed" value={m.completedFollowups} />
        </div>
      </section>

      <section>
        <SectionTitle
          kicker="CARE OPERATIONS"
          title="Exception workflow"
          text="Handoffs surface patients who need human follow-up; staff workload metrics reveal whether the system is reducing or adding work."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={BellRing} label="Open handoffs" value={m.openCases} />
          <Metric icon={Clock3} label="Overdue" value={m.overdue} />
          <Metric icon={HeartHandshake} label="Resolved" value={m.resolvedCases} />
          <Metric
            icon={Clock3}
            label="Median resolution"
            value={m.medianResolutionMinutes + " min"}
          />
          <Metric label="Unowned cases" value={m.unowned} />
          <Metric label="Failed deliveries" value={m.failedDeliveries} />
          <Metric label="Unsuccessful contacts" value={m.unsuccessfulContacts} />
          <Metric label="Opt-outs" value={m.optOuts} />
          <Metric
            label="Duplicate-entry minutes"
            value={m.duplicateEntryMinutes}
            note={m.staffFeedbackCount + " staff feedback record(s)"}
          />
          <Metric
            label="Average alert burden"
            value={m.averageAlertBurden + " / 5"}
            note="Staff reported; lower is preferable"
          />
        </div>
      </section>

      <section>
        <SectionTitle
          kicker="REWARD PROGRAM"
          title="Capsule obligations and funded benefits"
          text="Capsule issuance is not revenue. Benefit redemption debits the hospital program's funded reward budget."
          badge={<SimulationBadge real>REAL PROGRAM LEDGER</SimulationBadge>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Coins} label="Capsules issued" value={r.capsulesIssued} />
          <Metric icon={Gift} label="Capsules redeemed" value={r.capsulesRedeemed} />
          <Metric icon={WalletCards} label="Benefit redemptions" value={r.redemptionCount} />
          <Metric icon={Banknote} label="Budget remaining" value={"₹" + r.remainingBudgetInr.toLocaleString()} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {(data.programs || []).map((program) => {
            const spentPct = program.fundedBudgetInr
              ? Math.min(100, Math.round((program.spentBudgetInr / program.fundedBudgetInr) * 100))
              : 0;
            return (
              <article key={program._id} className="cq-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      {program.name}
                    </div>
                    <h3 className="mt-2 text-xl font-black">
                      {program.capsuleSymbol} program
                    </h3>
                  </div>
                  <span className="cq-pixel-label">{program.capsuleSymbol}</span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xl font-black">{program.capsulesIssued}</div>
                    <div className="text-[11px] text-muted-foreground">issued</div>
                  </div>
                  <div>
                    <div className="text-xl font-black">{program.redemptionCount}</div>
                    <div className="text-[11px] text-muted-foreground">redemptions</div>
                  </div>
                  <div>
                    <div className="text-xl font-black">₹{program.remainingBudgetInr}</div>
                    <div className="text-[11px] text-muted-foreground">remaining</div>
                  </div>
                </div>
                <div className="cq-progress mt-5">
                  <span style={{ width: spentPct + "%" }} />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  ₹{program.spentBudgetInr} spent of ₹{program.fundedBudgetInr} funded
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          kicker="RECORDED FINANCE"
          title="Payment evidence"
          text={data.definitions.recordedFinance}
          badge={<SimulationBadge real>RECORDED APPLICATION DATA</SimulationBadge>}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <Metric
            icon={Banknote}
            label="Paid consultations recorded"
            value={f.recordedPaidConsultations}
          />
          <Metric
            icon={Banknote}
            label="Recorded paid amount"
            value={"₹" + f.recordedPaidInr.toLocaleString()}
          />
          <Metric
            icon={ShieldCheck}
            label="Refunds imported"
            value={f.refundsRecordedInCareQuest}
            note={f.note}
          />
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-[#e5dbc2] bg-[#faf6ea] p-5 md:p-6">
        <SectionTitle
          kicker="FUTURE COMPUTE MODEL"
          title="SIMULATED pilot economics"
          text={data.definitions.simulatedCompute}
          badge={<SimulationBadge>SIMULATED COMPUTE / MARKET</SimulationBadge>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [s.sessionCount, "virtual sessions"],
            ["₹" + s.simulatedGrossValueInr.toFixed(2), "virtual gross"],
            ["₹" + s.simulatedPatientShareInr.toFixed(2), "patient allocation"],
            ["₹" + s.simulatedHospitalShareInr.toFixed(2), "hospital allocation"],
            ["₹" + s.simulatedPlatformShareInr.toFixed(2), "platform allocation"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-xl border border-[#e5dbc2] bg-white/70 p-4">
              <div className="text-2xl font-black">{value}</div>
              <div className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          This panel is deliberately excluded from recorded hospital finance. It is a
          concept simulation of phone compute, public token value and hypothetical payout
          splits—not actual mining income or hospital revenue.
        </p>
      </section>
    </div>
  );
}
