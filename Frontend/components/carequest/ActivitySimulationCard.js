"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Footprints,
  Play,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import SimulationBadge from "@/components/carequest/SimulationBadge";
import {
  completeActivitySimulation,
  startActivitySimulation,
} from "@/actions/activitySimulationActions";
import { updateProgramActivityConsent } from "@/actions/programActions";

export default function ActivitySimulationCard({
  programCard,
  activityOccurrence,
  onChanged,
}) {
  const { program, organization, membership } = programCard;
  const goal =
    activityOccurrence?.activityConfig?.goalValue ||
    program.rules?.activityGoalSteps ||
    5000;
  const reward = program.rules?.activityRewardCapsules || 3;
  const [consented, setConsented] = useState(Boolean(membership?.consents?.simulatedActivityData));
  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const timer = useRef(null);

  const progress = Math.min(100, Math.round((steps / goal) * 100));
  const hashRate = useMemo(
    () => Math.round((8 + (steps / Math.max(goal, 1)) * 11.4) * 10) / 10,
    [steps, goal]
  );

  useEffect(() => () => clearInterval(timer.current), []);

  async function connectDemoDevice() {
    setMessage("");
    try {
      await updateProgramActivityConsent(program._id, true);
      setConsented(true);
      setMessage("Simulated device permission enabled for this demo program.");
      onChanged?.();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function start() {
    setMessage("");
    try {
      if (!activityOccurrence?._id) {
        throw new Error("No clinician-approved activity mission is available");
      }
      const created = await startActivitySimulation(
        program._id,
        activityOccurrence._id,
        "demo_health_connect"
      );
      setSession(created);
      setSteps(0);
      setResult(null);
      setRunning(true);
      clearInterval(timer.current);
      const increment = Math.max(120, Math.round(goal / 28));
      timer.current = setInterval(() => {
        setSteps((current) => {
          const next = Math.min(goal, current + increment);
          if (next >= goal) {
            clearInterval(timer.current);
            setRunning(false);
          }
          return next;
        });
      }, 150);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function verify() {
    if (!session) return;
    setMessage("");
    try {
      const completed = await completeActivitySimulation(session._id);
      setResult(completed);
      setSteps(goal);
      setMessage(
        completed.duplicate
          ? "This synthetic evidence was already processed; no duplicate award was created."
          : "Synthetic device evidence verified. The real hospital Capsule ledger was updated."
      );
      onChanged?.();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="cq-card cq-grid-paper overflow-hidden p-5 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <SimulationBadge>SIMULATED DEVICE</SimulationBadge>
            <SimulationBadge>SIMULATED COMPUTE</SimulationBadge>
            <SimulationBadge>SIMULATED MARKET</SimulationBadge>
          </div>
          <div className="mt-4 cq-kicker">ACTIVE CARE MISSION · {organization.name}</div>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Walking activity demo</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The phone/wearable, proof-of-work and public-value stream are virtual.
            Eligibility, duplicate protection, Capsule award, audit and hospital program
            accounting after submission are real application logic.
          </p>
        </div>
        <PixelCharacter
          variant="walker"
          mood={result ? "celebrate" : running ? "wave" : "idle"}
          size={86}
          speech={result ? "+" + reward + " " + program.capsuleSymbol + "!" : "Ready for a calm activity mission."}
        />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-white/90 p-4">
          <Footprints className="h-4 w-4 text-primary" />
          <div className="mt-3 text-2xl font-black">{steps.toLocaleString()}</div>
          <div className="text-xs font-semibold text-muted-foreground">of {goal.toLocaleString()} steps</div>
        </div>
        <div className="rounded-xl border border-border bg-white/90 p-4">
          <Cpu className="h-4 w-4 text-[#817996]" />
          <div className="mt-3 text-2xl font-black">{hashRate} H/s</div>
          <div className="text-xs font-semibold text-muted-foreground">virtual hash rate</div>
        </div>
        <div className="rounded-xl border border-border bg-white/90 p-4">
          <Activity className="h-4 w-4 text-[#9a8150]" />
          <div className="mt-3 text-2xl font-black">{Math.max(0, Math.round(steps / 420))}</div>
          <div className="text-xs font-semibold text-muted-foreground">virtual accepted shares</div>
        </div>
        <div className="rounded-xl border border-border bg-white/90 p-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div className="mt-3 text-2xl font-black">+{reward}</div>
          <div className="text-xs font-semibold text-muted-foreground">{program.capsuleSymbol} at verified goal</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>{progress}%</span>
          <span>{running ? "Demo stream active" : steps >= goal ? "Goal reached" : "Waiting"}</span>
        </div>
        <div className="cq-progress mt-2 h-3">
          <span style={{ width: progress + "%" }} />
        </div>
      </div>

      {!activityOccurrence ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-white/75 p-4 text-sm leading-6 text-muted-foreground">
          No clinician-approved activity mission is available in this hospital journey.
          The virtual phone/mining demo cannot start without one.
        </div>
      ) : activityOccurrence.status !== "due" ? (
        <div className="mt-5 rounded-xl border border-border bg-white/75 p-4 text-sm leading-6 text-muted-foreground">
          This activity is approved but scheduled for{" "}
          <strong className="text-foreground">
            {new Date(activityOccurrence.scheduledFor).toLocaleString()}
          </strong>
          . Use the demo clock only when demonstrating the scheduler.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {activityOccurrence && activityOccurrence.status === "due" && !consented ? (
          <Button variant="outline" onClick={connectDemoDevice}>
            <Smartphone className="h-4 w-4" />
            Connect simulated Health Connect
          </Button>
        ) : (
          <span className="cq-pixel-label cq-real-label">
            <CheckCircle2 className="h-3 w-3" /> DEMO CONSENT ON
          </span>
        )}

        {activityOccurrence &&
        activityOccurrence.status === "due" &&
        consented &&
        !session &&
        !result ? (
          <Button onClick={start}>
            <Play className="h-4 w-4" />
            Start simulated activity
          </Button>
        ) : null}

        {session && !result && !running && steps >= goal ? (
          <Button onClick={verify}>
            <ShieldCheck className="h-4 w-4" />
            Verify demo evidence & claim Capsules
          </Button>
        ) : null}

        {result ? (
          <span className="cq-pixel-label cq-real-label">
            <CheckCircle2 className="h-3 w-3" />
            Mission evidence processed once
          </span>
        ) : null}
      </div>

      {result?.mining ? (
        <div className="mt-5 rounded-xl border border-[#e6d9bc] bg-[#faf5e8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SimulationBadge>SIMULATED MINING PAYOUT</SimulationBadge>
            <span className="font-mono text-xs font-bold text-[#735f38]">
              {result.mining.simulatedCoinAmount} {result.mining.simulatedCoinSymbol}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["₹" + result.mining.simulatedGrossValueInr, "virtual gross"],
              ["₹" + result.mining.patientShareInr, "patient share"],
              ["₹" + result.mining.hospitalShareInr, "hospital share"],
              ["₹" + result.mining.platformShareInr, "platform share"],
            ].map(([value, label]) => (
              <div key={label}>
                <div className="text-lg font-black">{value}</div>
                <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            Concept simulation only. These values are not payments, hospital revenue or
            public-chain assets.
          </p>
        </div>
      ) : null}

      {message ? (
        <div className="cq-achievement mt-4 rounded-xl border border-border bg-white/90 px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
    </section>
  );
}
