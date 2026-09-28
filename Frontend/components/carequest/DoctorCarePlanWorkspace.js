"use client";

import { useMemo, useState } from "react";
import {
  approveCarePlanVersion,
  createCarePlanDraft,
  generateCarePlanDraftSuggestion,
  getDoctorCarePlanWorkspace,
  rejectCarePlanVersion,
  startCarePlanRevision,
  updateCarePlanDraft,
} from "@/actions/carePlanActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Plus, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import DoctorReportsPanel from "@/components/carequest/DoctorReportsPanel";

const today = () => new Date().toISOString().slice(0, 10);

function starterActivities() {
  return [
    {
      activityKey: "care-plan-lesson",
      type: "lesson",
      title: "Understand your care plan",
      instructions:
        "Review this clinician-approved lesson and note any questions for your care team.",
      recurrence: { kind: "once", interval: 1 },
      safetyText: "",
      helpText: "Use Need Help later if any instruction is unclear.",
    },
    {
      activityKey: "daily-check-in",
      type: "reminder",
      title: "Daily plan check-in",
      instructions:
        "Respond honestly to the scheduled reminder. A response is not proof that a medicine was taken or an activity was completed.",
      recurrence: { kind: "daily", timeLocal: "09:00", interval: 1 },
      safetyText: "",
      helpText:
        "If you have a concern, request help rather than changing clinical instructions yourself.",
    },
    {
      activityKey: "approved-walking-activity",
      type: "activity",
      title: "Clinician-approved walking activity",
      instructions:
        "Complete the step goal only if it remains appropriate for you. Stop and request support if the activity is not suitable.",
      recurrence: { kind: "once", timeLocal: "09:00", interval: 1 },
      activityConfig: { goalType: "steps", goalValue: 5000 },
      safetyText:
        "This demo activity is not a universal target. The clinician can edit or remove it.",
      helpText: "Use Need Help if you need an accessible alternative.",
    },
    {
      activityKey: "planned-follow-up",
      type: "follow_up",
      title: "Book your planned follow-up",
      instructions:
        "Use ArkCare's appointment flow to book the follow-up requested by your clinician.",
      recurrence: { kind: "once", interval: 1 },
      safetyText: "",
      helpText: "Contact your care team if you cannot arrange the follow-up.",
    },
  ];
}

function emptyForm() {
  return {
    title: "CareQuest continuity plan",
    summary: "",
    validFrom: today(),
    validTo: "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        : "UTC",
    safetyText:
      "This plan does not replace emergency care. Follow the clinician-approved instructions and use your local emergency services for emergencies.",
    helpText:
      "Use CareQuest help requests for non-emergency support. Do not wait for an app response during an emergency.",
    source: { type: "clinician", reference: "" },
    activities: starterActivities(),
  };
}

function versionToForm(version) {
  return {
    title: version.title || "",
    summary: version.summary || "",
    validFrom: String(version.validFrom || "").slice(0, 10),
    validTo: version.validTo ? String(version.validTo).slice(0, 10) : "",
    timezone: version.timezone || "UTC",
    safetyText: version.safetyText || "",
    helpText: version.helpText || "",
    source: version.source || { type: "clinician", reference: "" },
    activities: (version.activities || []).map((item) => ({
      activityKey: item.activityKey,
      type: item.type,
      title: item.title,
      instructions: item.instructions,
      recurrence: {
        kind: item.recurrence?.kind || "once",
        timeLocal: item.recurrence?.timeLocal || "",
        daysOfWeek: item.recurrence?.daysOfWeek || [],
        interval: item.recurrence?.interval || 1,
      },
      safetyText: item.safetyText || "",
      helpText: item.helpText || "",
      activityConfig: item.activityConfig || { goalType: "steps", goalValue: 5000 },
    })),
  };
}

export default function DoctorCarePlanWorkspace({ initialData }) {
  const [data, setData] = useState(initialData);
  const [appointmentId, setAppointmentId] = useState(
    initialData.appointments?.[0]?._id || ""
  );
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const appointmentById = useMemo(
    () =>
      new Map((data.appointments || []).map((item) => [String(item._id), item])),
    [data.appointments]
  );

  async function refresh() {
    const next = await getDoctorCarePlanWorkspace();
    setData(next);
  }

  async function loadAIDraftSuggestion() {
    if (!appointmentId) {
      setMessage("Choose a consultation first.");
      return;
    }

    setBusy("ai-draft");
    setMessage("");
    try {
      const suggestion = await generateCarePlanDraftSuggestion(appointmentId);
      setForm((current) => ({
        ...current,
        ...suggestion,
        validFrom: current.validFrom,
        validTo: current.validTo,
        timezone: current.timezone,
      }));
      setMessage(
        "AI draft loaded from the existing report summary. It is not saved or visible to the patient until you review, save, and approve it."
      );
    } catch (error) {
      setMessage(error.message || "Could not generate AI draft.");
    } finally {
      setBusy("");
    }
  }

  function updateActivity(index, field, value) {
    setForm((current) => ({
      ...current,
      activities: current.activities.map((activity, activityIndex) =>
        activityIndex === index
          ? { ...activity, [field]: value }
          : activity
      ),
    }));
  }

  function updateRecurrence(index, field, value) {
    setForm((current) => ({
      ...current,
      activities: current.activities.map((activity, activityIndex) =>
        activityIndex === index
          ? {
              ...activity,
              recurrence: {
                ...activity.recurrence,
                [field]: value,
              },
            }
          : activity
      ),
    }));
  }

  function addActivity() {
    setForm((current) => ({
      ...current,
      activities: [
        ...current.activities,
        {
          activityKey: `activity-${Date.now()}`,
          type: "activity",
          title: "",
          instructions: "",
          recurrence: { kind: "once", interval: 1 },
          safetyText: "",
          helpText: "",
          activityConfig: { goalType: "steps", goalValue: 5000 },
        },
      ],
    }));
  }

  function removeActivity(index) {
    setForm((current) => ({
      ...current,
      activities: current.activities.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function saveDraft() {
    setBusy("save");
    setMessage("");
    try {
      if (editingVersionId) {
        await updateCarePlanDraft(editingVersionId, form);
        setMessage("Draft saved.");
      } else {
        if (!appointmentId) throw new Error("Choose a consultation first.");
        await createCarePlanDraft({ ...form, appointmentId });
        setMessage("Draft created. It is not visible to the patient.");
      }
      setEditingVersionId(null);
      setForm(emptyForm());
      await refresh();
    } catch (error) {
      setMessage(error.message || "Could not save care plan.");
    } finally {
      setBusy("");
    }
  }

  async function approve(versionId) {
    setBusy(versionId);
    setMessage("");
    try {
      await approveCarePlanVersion(versionId);
      setMessage("Plan approved. The patient can now view this version.");
      await refresh();
    } catch (error) {
      setMessage(error.message || "Could not approve care plan.");
    } finally {
      setBusy("");
    }
  }

  async function reject(versionId) {
    const reason = window.prompt("Reason for rejecting this draft:");
    if (!reason) return;
    setBusy(versionId);
    setMessage("");
    try {
      await rejectCarePlanVersion(versionId, reason);
      setMessage("Draft rejected and retained in version history.");
      await refresh();
    } catch (error) {
      setMessage(error.message || "Could not reject care plan.");
    } finally {
      setBusy("");
    }
  }

  async function startRevision(planId) {
    setBusy(planId);
    setMessage("");
    try {
      const revision = await startCarePlanRevision(planId);
      setEditingVersionId(revision._id);
      setForm(versionToForm(revision));
      setMessage(
        `Editing revision v${revision.versionNumber}. The approved plan remains active until this revision is approved.`
      );
      await refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message || "Could not create revision.");
    } finally {
      setBusy("");
    }
  }

  const selectedAppointment = appointmentById.get(String(appointmentId));

  // The latest saved draft for the selected consultation, so the doctor can
  // publish (approve) it right here without hunting through Plan history.
  const selectedDraft = useMemo(() => {
    if (!appointmentId) return null;
    const plan = (data.plans || []).find(
      (p) => String(p.sourceAppointment?._id || p.sourceAppointment) === String(appointmentId)
    );
    if (!plan) return null;
    const drafts = (plan.versions || []).filter((v) => v.status === "draft");
    if (!drafts.length) return null;
    return drafts.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }, [data.plans, appointmentId]);

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
        <section className="cq-card cq-reveal p-5 md:p-6">
          <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="cq-pixel-label cq-real-label">CLINICIAN AUTHORITY</span>
                <span className="cq-pixel-label">VERSIONED PLANS</span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight">CareQuest Care Plans</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Draft versioned plans here. AI may suggest educational wording, but only
                an approved doctor action can publish a patient-facing version. The linked
                consultation must be completed before approval.
              </p>
            </div>
            <PixelCharacter
              variant="doctor"
              mood="idle"
              size={86}
              speech="Review first. Publish only when the plan is ready."
            />
          </div>
        </section>

        {message ? (
          <div className="cq-achievement rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}

        <Card className="cq-card border-border bg-card">
          <CardHeader>
            <CardTitle className="text-white">
              {editingVersionId ? "Edit draft version" : "Create care-plan draft"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!editingVersionId ? (
              <div className="space-y-2">
                <Label>Linked consultation</Label>
                <select
                  value={appointmentId}
                  onChange={(event) => setAppointmentId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
                >
                  <option value="">Choose consultation</option>
                  {(data.appointments || []).map((appointment) => (
                    <option key={appointment._id} value={appointment._id}>
                      {appointment.patient?.name || "Patient"} —{" "}
                      {new Date(appointment.appointmentDate).toLocaleString()} —{" "}
                      {appointment.status}
                    </option>
                  ))}
                </select>
                {selectedAppointment?.status !== "completed" && appointmentId ? (
                  <p className="text-xs text-amber-300">
                    You can draft now, but approval stays blocked until this consultation
                    is marked completed.
                  </p>
                ) : null}
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadAIDraftSuggestion}
                    disabled={!appointmentId || busy === "ai-draft"}
                  >
                    {busy === "ai-draft"
                      ? "Generating draft..."
                      : "Draft from latest processed report"}
                  </Button>
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-[#eeebf3] px-3 py-2 text-xs leading-5 text-[#665f79]">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      AI can draft education and follow-up questions only. It cannot
                      publish, prescribe, change doses, or activate this plan.
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Plan title</Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>IANA time zone</Label>
                <Input
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                  placeholder="Asia/Kolkata"
                />
              </div>
              <div className="space-y-2">
                <Label>Valid from</Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, validFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Valid to (optional)</Label>
                <Input
                  type="date"
                  value={form.validTo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, validTo: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Patient-friendly summary</Label>
              <Textarea
                rows={4}
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder="Explain the purpose of this plan without introducing new clinical instructions."
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Safety text</Label>
                <Textarea
                  rows={4}
                  value={form.safetyText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      safetyText: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Help text</Label>
                <Textarea
                  rows={4}
                  value={form.helpText}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, helpText: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white">Activities</h2>
                  <p className="text-xs text-muted-foreground">
                    Approval generates version-bound CareQuest occurrences; future plan revisions preserve prior mission history.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addActivity}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add activity
                </Button>
              </div>

              {form.activities.map((activity, index) => (
                <div
                  key={activity.activityKey || index}
                  className="space-y-4 rounded-xl border border-border bg-[#fafbf8] p-4"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <select
                        value={activity.type}
                        onChange={(event) =>
                          updateActivity(index, "type", event.target.value)
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
                      >
                        <option value="lesson">Lesson</option>
                        <option value="reminder">Reminder</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="activity">Activity</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Title</Label>
                      <Input
                        value={activity.title}
                        onChange={(event) =>
                          updateActivity(index, "title", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Instructions</Label>
                    <Textarea
                      rows={3}
                      value={activity.instructions}
                      onChange={(event) =>
                        updateActivity(index, "instructions", event.target.value)
                      }
                    />
                  </div>

                  {activity.type === "activity" ? (
                    <div className="rounded-xl border border-[#d6e2db] bg-primary-soft p-4">
                      <Label>Clinician-approved step goal</Label>
                      <Input
                        className="mt-2 max-w-xs"
                        type="number"
                        min={250}
                        max={50000}
                        step={250}
                        value={activity.activityConfig?.goalValue || 5000}
                        onChange={(event) =>
                          updateActivity(index, "activityConfig", {
                            goalType: "steps",
                            goalValue: Number(event.target.value),
                          })
                        }
                      />
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        This is patient-specific. Do not use 5,000/10,000 steps as a
                        universal health target; edit or remove the mission when it is
                        not clinically suitable.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Recurrence</Label>
                      <select
                        value={activity.recurrence?.kind || "once"}
                        onChange={(event) =>
                          updateRecurrence(index, "kind", event.target.value)
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
                      >
                        <option value="once">Once</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Local time</Label>
                      <Input
                        type="time"
                        value={activity.recurrence?.timeLocal || ""}
                        onChange={(event) =>
                          updateRecurrence(index, "timeLocal", event.target.value)
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={form.activities.length <= 1}
                        onClick={() => removeActivity(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={saveDraft} disabled={busy === "save"}>
                {busy === "save"
                  ? "Saving..."
                  : editingVersionId
                    ? "Save draft changes"
                    : "Create private draft"}
              </Button>
              {editingVersionId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingVersionId(null);
                    setForm(emptyForm());
                  }}
                >
                  Cancel editing
                </Button>
              ) : null}

              {selectedDraft && selectedAppointment?.status === "completed" ? (
                <Button
                  onClick={() => approve(selectedDraft._id)}
                  disabled={busy !== ""}
                  className="ml-auto"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {busy === selectedDraft._id
                    ? "Publishing..."
                    : `Publish plan to patient (v${selectedDraft.versionNumber})`}
                </Button>
              ) : null}
              {selectedDraft && selectedAppointment?.status !== "completed" ? (
                <p className="ml-auto self-center text-xs text-amber-300">
                  Draft v{selectedDraft.versionNumber} saved — mark the consultation
                  completed to publish it to the patient.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <DoctorReportsPanel />

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Plan history</h2>
            <p className="text-sm text-muted-foreground">
              Approved versions remain preserved when a later revision is published.
            </p>
          </div>

          {(data.plans || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              No care plans yet.
            </div>
          ) : (
            data.plans.map((plan) => (
              <Card key={plan._id} className="cq-card border-border bg-card">
                <CardHeader>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="text-white">
                        {plan.patient?.name || "Patient"}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Consultation{" "}
                        {plan.sourceAppointment?.appointmentDate
                          ? new Date(
                              plan.sourceAppointment.appointmentDate
                            ).toLocaleString()
                          : "unknown"}{" "}
                        · {plan.sourceAppointment?.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{plan.status}</Badge>
                      {plan.currentApprovedVersion ? (
                        <Badge variant="outline">
                          Current approved v{plan.currentApprovedVersion}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(plan.versions || []).map((version) => (
                    <div
                      key={version._id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-[#fafbf8] p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-white">
                            v{version.versionNumber} · {version.title}
                          </span>
                          <Badge variant="outline">{version.status}</Badge>
                          {version.source?.type === "ai_draft" ? (
                            <Badge variant="outline">AI-origin draft</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {version.activities?.length || 0} activities · timezone{" "}
                          {version.timezone}
                        </p>
                        {version.rejectionReason ? (
                          <p className="mt-2 text-sm text-rose-300">
                            Rejected: {version.rejectionReason}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {version.status === "draft" ? (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingVersionId(version._id);
                                setForm(versionToForm(version));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => approve(version._id)}
                              disabled={busy === version._id}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => reject(version._id)}
                              disabled={busy === version._id}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {plan.currentApprovedVersion &&
                  !(plan.versions || []).some(
                    (version) => version.status === "draft"
                  ) ? (
                    <Button
                      variant="outline"
                      onClick={() => startRevision(plan._id)}
                      disabled={busy === plan._id}
                    >
                      Start revision
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </section>
    </div>
  );
}
