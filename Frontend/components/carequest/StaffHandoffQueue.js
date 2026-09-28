"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Link2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  assignHandoffCase,
  escalateHandoffCase,
  getHandoffQueue,
  reassignHandoffForShift,
  recordHandoffContact,
  resolveHandoffCase,
  submitWorkflowFeedback,
} from "@/actions/staffActions";
import { pusherClient } from "@/lib/pusher";
import PixelCharacter from "@/components/carequest/PixelCharacter";

function statusTone(item) {
  if (item.overdue) return "bg-warning-soft text-warning border-[#eadab7]";
  if (item.status === "resolved") return "bg-success-soft text-success border-[#cde0d5]";
  if (item.status === "escalated") return "bg-[#eeebf3] text-[#665f79] border-[#dcd6e6]";
  return "bg-white text-muted-foreground border-border";
}

export default function StaffHandoffQueue({
  initialCases,
  role,
  organizationId,
}) {
  const [cases, setCases] = useState(initialCases);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [reaction, setReaction] = useState("idle");

  async function refresh() {
    setCases(await getHandoffQueue());
  }

  useEffect(() => {
    if (!organizationId) return undefined;

    const channelName =
      "private-carequest-staff-" + String(organizationId);
    let channel;
    try {
      channel = pusherClient.subscribe(channelName);
      channel.bind("handoff.updated", refresh);
    } catch {}

    return () => {
      try {
        channel?.unbind("handoff.updated", refresh);
        pusherClient.unsubscribe(channelName);
      } catch {}
    };
    // refresh reads authoritative server state and intentionally is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function run(key, fn, mood = "celebrate") {
    setBusy(key);
    setMessage("");
    try {
      await fn();
      await refresh();
      setReaction(mood);
      setTimeout(() => setReaction("idle"), 1200);
    } catch (error) {
      setMessage(error.message || "Handoff action failed");
      setReaction("alert");
      setTimeout(() => setReaction("idle"), 1200);
    } finally {
      setBusy("");
    }
  }

  function ask(label) {
    return window.prompt(label) || "";
  }

  const open = cases.filter((item) => item.status !== "resolved");
  const overdue = open.filter((item) => item.overdue);
  const unowned = open.filter((item) => !item.assignedTo);

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="cq-pixel-label">{role.toUpperCase()} WORKSPACE</span>
              <span className="cq-pixel-label cq-real-label">HUMAN HANDOFF</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">
              CareQuest handoff queue
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              One owned case per configured help event. Escalation is a safe workflow
              action—not a failure—and clinical changes remain doctor-only.
            </p>
            <Button variant="outline" className="mt-4" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Refresh queue
            </Button>
          </div>
          <PixelCharacter
            variant={role === "doctor" ? "doctor" : "nurse"}
            mood={overdue.length ? "alert" : reaction}
            size={90}
            speech={
              overdue.length
                ? overdue.length + " overdue case(s)."
                : open.length
                  ? open.length + " open case(s) to coordinate."
                  : "Queue is clear."
            }
          />
        </div>
      </section>

      {message ? (
        <div className="cq-achievement rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          [open.length, "Open", MessageCircle],
          [unowned.length, "Unowned", UserCheck],
          [overdue.length, "Overdue", Clock3],
        ].map(([value, label, Icon]) => (
          <div key={label} className="cq-card p-4">
            <Icon className="h-4 w-4 text-primary" />
            <div className="mt-4 text-3xl font-black">{value}</div>
            <div className="text-xs font-bold text-muted-foreground">{label}</div>
          </div>
        ))}
      </section>

      {["nurse", "coordinator"].includes(role) ? (
        <section className="cq-card p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="cq-kicker">WORKLOAD FEEDBACK</div>
              <h2 className="mt-1 font-black">Measure the workflow, not staff speed.</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Report duplicate-entry time and alert burden so the hospital can see
                whether CareQuest is reducing or adding operational work.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const minutes = window.prompt(
                  "Minutes spent on duplicate/manual entry in this work period:",
                  "0"
                );
                if (minutes === null) return;
                const burden = window.prompt(
                  "Alert burden from 1 (low) to 5 (high):",
                  "2"
                );
                if (burden === null) return;
                const note = window.prompt("Optional workflow note:", "") || "";
                run("workflow-feedback", async () => {
                  await submitWorkflowFeedback({
                    duplicateEntryMinutes: Number(minutes),
                    alertBurden: Number(burden),
                    note,
                  });
                  setMessage("Workflow feedback recorded.");
                });
              }}
            >
              Record workload feedback
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {cases.map((item) => (
          <article key={item._id} className="cq-card overflow-hidden">
            <div className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{item.priority}</Badge>
                    <span className={"cq-pixel-label " + statusTone(item)}>
                      {item.overdue ? "OVERDUE" : item.status.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-black">
                    {item.patient?.name || "Authorized patient case"}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {item.summary}
                  </p>
                  {item.source === "direct_help" ? (
                    <span className="cq-pixel-label mt-2 inline-flex">
                      NEED HELP REQUEST
                    </span>
                  ) : null}
                  {item.requestHash ? (
                    <p className="mt-2 flex items-center gap-1 break-all font-mono text-[10px] text-muted-foreground">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      request {item.requestHash.slice(0, 22)}…
                      {item.requestBlockchain?.status === "anchored" ? (
                        <span className="cq-real-label cq-pixel-label ml-1">
                          on-chain
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {item.status === "resolved" && item.resolution ? (
                    <div className="mt-2 rounded-lg border border-[#cde0d5] bg-success-soft p-2 text-xs">
                      <div className="flex items-center gap-1 font-bold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Work done
                        {item.resolution.blockchain?.status === "anchored" ? (
                          <span className="ml-1 inline-flex items-center gap-1 font-mono text-[9px]">
                            <Link2 className="h-3 w-3" /> on-chain
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {item.resolution.outcome}
                      </p>
                      <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">
                        by {item.resolution.resolvedByName || item.resolution.resolvedByRole}
                        {" · "}res {item.resolution.outcomeHash?.slice(0, 20)}…
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted p-3">
                    <div className="font-semibold text-muted-foreground">Owner</div>
                    <div className="mt-1 font-bold">{item.assignedTo?.name || "Unowned"}</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <div className="font-semibold text-muted-foreground">Due</div>
                    <div className="mt-1 font-bold">{new Date(item.dueAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {["nurse", "coordinator"].includes(role) && item.status !== "resolved" ? (
                  <Button
                    variant="outline"
                    disabled={busy !== ""}
                    onClick={() =>
                      run(item._id + "assign", () => assignHandoffCase(item._id))
                    }
                  >
                    <UserCheck className="h-4 w-4" /> Assign to me
                  </Button>
                ) : null}

                {["nurse", "coordinator"].includes(role) && item.status !== "resolved" ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy !== ""}
                      onClick={() => {
                        const note = ask("Document successful contact:");
                        if (note)
                          run(item._id + "contact", () =>
                            recordHandoffContact(item._id, {
                              successful: true,
                              note,
                            })
                          );
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Contacted
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy !== ""}
                      onClick={() => {
                        const note = ask("Document unsuccessful contact:");
                        if (note)
                          run(item._id + "miss", () =>
                            recordHandoffContact(item._id, {
                              successful: false,
                              note,
                            })
                          , "alert");
                      }}
                    >
                      <AlertTriangle className="h-4 w-4" /> Unsuccessful contact
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy !== ""}
                      onClick={() => {
                        const note = ask("Clinical question for doctor:");
                        if (note)
                          run(item._id + "escalate", () =>
                            escalateHandoffCase(item._id, note)
                          , "wave");
                      }}
                    >
                      <ArrowUpRight className="h-4 w-4" /> Escalate to doctor
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy !== ""}
                      onClick={() =>
                        run(item._id + "shift", () =>
                          reassignHandoffForShift(item._id, "Demo shift change")
                        )
                      }
                    >
                      Shift reassignment
                    </Button>
                  </>
                ) : null}

                {item.status !== "resolved" ? (
                  <Button
                    disabled={busy !== ""}
                    onClick={() => {
                      const outcome = ask("Document outcome/reason before closing:");
                      if (outcome)
                        run(item._id + "resolve", () =>
                          resolveHandoffCase(item._id, outcome)
                        );
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Resolve with outcome
                  </Button>
                ) : null}
              </div>
            </div>

            <details className="border-t border-border bg-[#fafbf8]">
              <summary className="cursor-pointer px-5 py-3 text-xs font-bold text-primary">
                Immutable case history ({item.events?.length || 0})
              </summary>
              <div className="space-y-2 px-5 pb-5">
                {(item.events || []).map((event) => (
                  <div
                    key={event._id}
                    className="rounded-lg border border-border bg-white p-3 text-xs"
                  >
                    <strong>{event.eventType}</strong>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                    {event.note ? (
                      <p className="mt-1 text-muted-foreground">{event.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}

        {!cases.length ? (
          <div className="cq-card flex items-center gap-4 border-dashed p-8">
            <PixelCharacter variant={role === "doctor" ? "doctor" : "nurse"} mood="idle" size={66} />
            <div>
              <h3 className="font-bold">No authorized handoff cases</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The queue will refresh when a patient requests help or a configured exception creates a case.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
