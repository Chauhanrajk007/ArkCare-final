"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  HelpCircle,
  Pause,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  completeLessonMission,
  getPatientMissionDashboard,
  makeNextSyntheticMissionDue,
  respondToMission,
  simulateSyntheticDeliveryFailure,
  updateCareQuestPreferences,
} from "@/actions/missionActions";
import { getCarePassport } from "@/actions/programActions";
import {
  getPatientBlockchainState,
  syncPatientCapsulesToBlockchain,
} from "@/actions/blockchainActions";
import { pusherClient } from "@/lib/pusher";
import { getPatientReportTimeline } from "@/actions/reportActions";
import CarePassport from "@/components/carequest/CarePassport";
import ActivitySimulationCard from "@/components/carequest/ActivitySimulationCard";
import BenefitCatalog from "@/components/carequest/BenefitCatalog";
import PatientReportsTimeline from "@/components/carequest/PatientReportsTimeline";
import CapsuleIcon from "@/components/carequest/CapsuleIcon";
import PromptDialog from "@/components/carequest/PromptDialog";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import SimulationBadge from "@/components/carequest/SimulationBadge";

function formatWhen(value) {
  return new Date(value).toLocaleString();
}

export default function PatientMissionDashboard({ initialData, initialPassport }) {
  const [data, setData] = useState(initialData);
  const [passport, setPassport] = useState(initialPassport);
  const [selectedProgramId, setSelectedProgramId] = useState(
    initialPassport?.programs?.[0]?.program?._id || ""
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [reaction, setReaction] = useState("idle");
  const [blockchain, setBlockchain] = useState(null);
  const [reports, setReports] = useState([]);
  const [openReportId, setOpenReportId] = useState(null);

  const primaryProgramId = passport?.programs?.[0]?.program?._id;
  const selectedProgram = useMemo(
    () =>
      (passport?.programs || []).find(
        (item) => String(item.program._id) === String(selectedProgramId)
      ) || passport?.programs?.[0],
    [passport, selectedProgramId]
  );

  async function refresh() {
    const [next, nextPassport, nextReports] = await Promise.all([
      getPatientMissionDashboard(),
      getCarePassport(),
      getPatientReportTimeline(),
    ]);
    setData(next);
    setPassport(nextPassport);
    setReports(nextReports);
  }

  useEffect(() => {
    let channel;
    try {
      channel = pusherClient.subscribe("private-carequest-user-" + initialData.userId);
      channel.bind("mission.updated", refresh);
    } catch {}
    return () => {
      try {
        channel?.unbind("mission.updated", refresh);
        pusherClient.unsubscribe("private-carequest-user-" + initialData.userId);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.userId]);

  // Reports are not part of the server-provided initial payload, so load them
  // once on mount. A doctor filing a report triggers mission.updated, which
  // calls refresh() and pulls the new report in.
  useEffect(() => {
    let active = true;
    getPatientReportTimeline()
      .then((next) => {
        if (active) setReports(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function openReport(id) {
    setOpenReportId(id);
    if (id) {
      const el = document.getElementById("carequest-reports");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function action(key, fn, mood = "celebrate") {
    setBusy(key);
    setMessage("");
    try {
      await fn();
      await refresh();
      // Nudge the capsule gauge to refetch immediately after any reward-affecting action.
      window.dispatchEvent(new Event("arkcare-capsules"));
      setReaction(mood);
      setTimeout(() => setReaction("idle"), 1300);
    } catch (error) {
      setReaction("alert");
      setMessage(error.message || "CareQuest action failed");
      setTimeout(() => setReaction("idle"), 1300);
    } finally {
      setBusy("");
    }
  }

  // Mission responses that need a written note use a proper input field
  // (PromptDialog) rather than the native window.prompt popup.
  const [notePrompt, setNotePrompt] = useState(null);

  function respond(occurrence, response) {
    if (response === "need_help" || response === "not_done") {
      setNotePrompt({ occurrence, response });
      return;
    }
    action(occurrence._id + response, () =>
      respondToMission(occurrence._id, response, "", 15),
      "celebrate"
    );
  }

  function confirmNote(note) {
    const { occurrence, response } = notePrompt;
    setNotePrompt(null);
    action(
      occurrence._id + response,
      () => respondToMission(occurrence._id, response, note, 15),
      response === "need_help" ? "alert" : "celebrate"
    );
  }

  async function savePreference(patch) {
    const next = {
      ...data.preference,
      ...patch,
      accessibility: {
        ...(data.preference.accessibility || {}),
        ...(patch.accessibility || {}),
      },
      quietHours: {
        ...(data.preference.quietHours || {}),
        ...(patch.quietHours || {}),
      },
    };
    await action("preferences", async () => {
      await updateCareQuestPreferences(next);
      setMessage("CareQuest preferences updated.");
    }, "wave");
  }

  async function readBlockchain() {
    setBusy("blockchain");
    try {
      setBlockchain(await getPatientBlockchainState());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  async function syncBlockchain() {
    setBusy("blockchain-sync");
    try {
      const state = await syncPatientCapsulesToBlockchain();
      setBlockchain(state);
      setMessage(
        state.disabled
          ? "Blockchain is disabled; the database Capsule ledger remains authoritative."
          : "Blockchain proof synchronized."
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  }

  const rewardsEnabled = data.preference?.careQuestOptIn !== false;
  const selectedOrganizationId = selectedProgram?.organization?._id || "";
  const selectedOccurrences = (data.occurrences || []).filter((item) => {
    if (item.program) {
      return String(item.program) === String(selectedProgramId);
    }
    return String(selectedProgramId) === String(primaryProgramId);
  });
  const selectedHandoffs = (data.openHandoffs || []).filter((item) => {
    if (item.organization) {
      return String(item.organization) === String(selectedOrganizationId);
    }
    return String(selectedProgramId) === String(primaryProgramId);
  });
  const approvedActivityOccurrence =
    selectedOccurrences.find(
      (item) =>
        item.activityType === "activity" &&
        !["completed", "cancelled", "expired"].includes(item.status)
    ) || null;

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal overflow-hidden p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="cq-pixel-label">CAREQUEST</span>
              <span className="cq-pixel-label">PARTICIPATION ≠ HEALTH SCORE</span>
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">Your care missions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Follow the clinician-approved plan, communicate honestly and ask for human
              support when you need it. CareQuest rewards participation, not perfect outcomes.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/patient/care-plans"
                className="inline-flex min-h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-muted"
              >
                View approved plan
              </Link>
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </div>
          <PixelCharacter
            variant={selectedProgram?.program?.visualTheme?.mascot === "walker" ? "walker" : "guide"}
            mood={reaction}
            size={96}
            speech={selectedHandoffs.length ? "Your care team can see your open help request." : "Small steps count."}
          />
        </div>
      </section>

      {message ? (
        <div className="cq-achievement rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <CarePassport
        passport={passport}
        selectedProgramId={selectedProgramId}
        onSelect={setSelectedProgramId}
      />

      {selectedProgram ? (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="cq-card p-5">
            <div className="cq-kicker">CURRENT BALANCE</div>
            <div className="mt-3 flex items-end gap-2">
              <div className="text-4xl font-black">{selectedProgram.balance}</div>
              <CapsuleIcon size={20} className="pb-1 text-primary" title="Capsules" />
              <div className="pb-1 text-xs font-bold text-muted-foreground">
                {selectedProgram.program.capsuleSymbol}
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Hospital-specific, non-transferable participation units.
            </p>
          </div>
          <div className="cq-card p-5">
            <div className="cq-kicker">CARE-TEAM RESPONSE</div>
            <div className="mt-3 text-4xl font-black">{selectedHandoffs.length}</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {selectedHandoffs.length
                ? "help request(s) are owned by the care workflow"
                : "No open handoffs in this hospital context"}
            </p>
          </div>
          <div className="cq-card p-5">
            <div className="cq-kicker">NEXT BENEFIT</div>
            <div className="mt-3 text-2xl font-black">
              {selectedProgram.catalog?.[0]
                ? selectedProgram.catalog[0].costCapsules + " " + selectedProgram.program.capsuleSymbol
                : "—"}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Funded catalog benefits are hospital-specific and never cash-out tokens.
            </p>
          </div>
        </section>
      ) : null}

      {selectedProgram ? (
        <ActivitySimulationCard
          programCard={selectedProgram}
          activityOccurrence={approvedActivityOccurrence}
          onChanged={refresh}
        />
      ) : null}

      <PatientReportsTimeline
        reports={reports}
        openId={openReportId}
        onOpenReport={openReport}
        onChanged={refresh}
      />

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="cq-kicker">CLINICIAN-APPROVED JOURNEY</div>
            <h2 className="mt-1 text-2xl font-black">Mission timeline</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upcoming tasks stay visible even if a notification channel fails.
            </p>
          </div>
          {!selectedOccurrences.length ? (
            <span className="cq-pixel-label">
              No clinician-approved missions in this hospital journey yet
            </span>
          ) : null}
        </div>

        {selectedOccurrences.length
          ? selectedOccurrences.map((occurrence) => {
              const final = ["responded", "completed", "cancelled", "expired"].includes(
                occurrence.status
              );
              return (
                <article key={occurrence._id} className="cq-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{occurrence.activityType}</Badge>
                        <Badge variant="outline">{occurrence.status}</Badge>
                        {occurrence.deliveryStatus === "failed" ? (
                          <SimulationBadge>DELIVERY FAILED</SimulationBadge>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-lg font-bold">{occurrence.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {occurrence.instructions}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-muted-foreground">
                        {formatWhen(occurrence.scheduledFor)} · {occurrence.timezone}
                      </p>
                      {occurrence.currentResponse ? (
                        <p className="mt-2 text-sm font-semibold text-primary">
                          You reported: {occurrence.currentResponse.replace("_", " ")}
                        </p>
                      ) : null}
                      {occurrence.safetyText ? (
                        <div className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
                          {occurrence.safetyText}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-[250px] flex-wrap gap-2 lg:justify-end">
                      {occurrence.activityType === "lesson" && !final ? (
                        <>
                          <Button
                            disabled={busy !== ""}
                            onClick={() =>
                              action(occurrence._id + "understood", () =>
                                completeLessonMission(occurrence._id, "understood")
                              )
                            }
                          >
                            <Sparkles className="h-4 w-4" />
                            I understand{rewardsEnabled ? " +2 CAP" : ""}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy !== ""}
                            onClick={() =>
                              action(
                                occurrence._id + "question",
                                () => completeLessonMission(occurrence._id, "needs_clarification"),
                                "alert"
                              )
                            }
                          >
                            <HelpCircle className="h-4 w-4" />
                            I have a question{rewardsEnabled ? " +2 CAP" : ""}
                          </Button>
                        </>
                      ) : null}

                      {occurrence.activityType === "activity" && !final ? (
                        <span className="cq-pixel-label">
                          Complete in the activity panel above
                        </span>
                      ) : null}

                      {occurrence.activityType === "follow_up" && !occurrence.linkedAppointment ? (
                        <Link
                          href="/patient"
                          className="inline-flex min-h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-muted"
                        >
                          Book through appointments
                        </Link>
                      ) : null}

                      {occurrence.activityType === "quiz" && !final ? (
                        <Button
                          disabled={busy !== ""}
                          onClick={() => openReport(occurrence.sourceReport)}
                        >
                          <Sparkles className="h-4 w-4" />
                          Take knowledge check
                        </Button>
                      ) : null}

                      {!final &&
                      occurrence.status === "due" &&
                      !["lesson", "follow_up", "activity", "quiz"].includes(occurrence.activityType) ? (
                        <>
                          <Button disabled={busy !== ""} onClick={() => respond(occurrence, "done")}>
                            <CheckCircle2 className="h-4 w-4" />
                            Done{rewardsEnabled ? " +1" : ""}
                          </Button>
                          <Button variant="outline" disabled={busy !== ""} onClick={() => respond(occurrence, "not_done")}>
                            <XCircle className="h-4 w-4" />
                            Not done{rewardsEnabled ? " +1" : ""}
                          </Button>
                          <Button variant="outline" disabled={busy !== ""} onClick={() => respond(occurrence, "need_help")}>
                            <HelpCircle className="h-4 w-4" />
                            Need help{rewardsEnabled ? " +1" : ""}
                          </Button>
                          <Button variant="outline" disabled={busy !== ""} onClick={() => respond(occurrence, "snooze")}>
                            Snooze
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          : (
            <div className="cq-card flex items-center gap-4 border-dashed p-6">
              <PixelCharacter variant="walker" mood="idle" size={66} />
              <div>
                <h3 className="font-bold">Independent hospital journey</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This hospital journey has its own membership, Capsule wallet, activity
                  program, benefits and clinician-approved missions. Nothing is borrowed
                  from another hospital&apos;s clinical plan.
                </p>
              </div>
            </div>
          )}

        {!selectedOccurrences.length ? (
          <div className="cq-card border-dashed p-8 text-center text-sm text-muted-foreground">
            No missions yet. A doctor must approve a CareQuest plan first.
          </div>
        ) : null}
      </section>

      {selectedProgram ? (
        <BenefitCatalog programCard={selectedProgram} onChanged={refresh} />
      ) : null}

      <section className="cq-card p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="cq-kicker">PREFERENCES & DEMO CONTROLS</div>
            <h2 className="mt-1 text-xl font-black">Keep control of the journey</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Opting out stops gamified rewards without blocking ordinary care.
              Accelerated/failure controls below are synthetic judge tools only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy === "preferences"}
              onClick={() =>
                savePreference({
                  careQuestOptIn: data.preference?.careQuestOptIn === false,
                })
              }
            >
              <ShieldCheck className="h-4 w-4" />
              {data.preference?.careQuestOptIn === false
                ? "Opt back into CareQuest"
                : "Opt out of gamified CareQuest"}
            </Button>
            <Button
              variant="outline"
              disabled={busy === "preferences"}
              onClick={() => savePreference({ paused: !data.preference?.paused })}
            >
              <Pause className="h-4 w-4" />
              {data.preference?.paused ? "Resume reminders" : "Pause reminders"}
            </Button>
            <Button
              variant="outline"
              disabled={busy === "demo-clock"}
              onClick={() =>
                action("demo-clock", async () => {
                  const result = await makeNextSyntheticMissionDue(selectedProgramId);
                  setMessage(
                    result.success
                      ? "Synthetic demo clock moved the next mission to due."
                      : "No scheduled synthetic mission is available."
                  );
                }, "wave")
              }
            >
              <Clock3 className="h-4 w-4" />
              Make next mission due (demo)
            </Button>
            <Button
              variant="outline"
              disabled={busy === "demo-failure"}
              onClick={() =>
                action("demo-failure", async () => {
                  const result = await simulateSyntheticDeliveryFailure(selectedProgramId);
                  setMessage(
                    result.success
                      ? "Synthetic notification failure recorded. Mission remains visible in-app."
                      : "No synthetic mission is available for failure simulation."
                  );
                }, "alert")
              }
            >
              Simulate notification failure
            </Button>
          </div>
        </div>
      </section>

      <section className="cq-card p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="cq-kicker">BLOCKCHAIN PROOF RAIL</div>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-black">
              <WalletCards className="h-5 w-5 text-primary" />
              On-chain verification
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Blockchain remains non-clinical. Care responses and staff workflows continue
              even when this proof rail is offline.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={readBlockchain} disabled={busy === "blockchain"}>
              Check
            </Button>
            <Button variant="outline" onClick={syncBlockchain} disabled={busy === "blockchain-sync"}>
              Sync proof
            </Button>
          </div>
        </div>
        {blockchain ? (
          <pre className="mt-4 overflow-auto rounded-xl border border-border bg-[#f8faf7] p-4 text-xs text-muted-foreground">
            {JSON.stringify(blockchain, null, 2)}
          </pre>
        ) : null}
      </section>
      <PromptDialog
        open={Boolean(notePrompt)}
        title={
          notePrompt?.response === "need_help"
            ? "What do you need help with?"
            : "What made this difficult?"
        }
        description={
          notePrompt?.response === "need_help"
            ? "Describe what you need. Your care team and a nurse will see this. Do not use this queue for an emergency."
            : "Optional: tell your care team what got in the way. You still receive participation credit."
        }
        placeholder={
          notePrompt?.response === "need_help"
            ? "e.g. I have a side effect from my new medicine"
            : "e.g. I did not have time today"
        }
        required={notePrompt?.response === "need_help"}
        confirmLabel={notePrompt?.response === "need_help" ? "Send to my care team" : "Submit"}
        onCancel={() => setNotePrompt(null)}
        onConfirm={confirmNote}
      />
    </div>
  );
}
