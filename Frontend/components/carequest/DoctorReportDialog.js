"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { parseDoctorReportPreview, submitDoctorReport } from "@/actions/reportActions";

/**
 * The doctor's "Report" flow, available during/after a consultation:
 *  - type remarks + activity advice, and/or attach a prescription image
 *  - "Parse with AI" -> OCR the image, structure the report into JSON, and
 *    build the RAG quiz preview. Nothing is saved yet.
 *  - "Submit report" -> the doctor publishes; the report is content-hashed,
 *    anchored on-chain, turned into a care plan + missions, and audited.
 */
export default function DoctorReportDialog({ appointment, isOpen, onClose, onDone }) {
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [patientActivity, setPatientActivity] = useState("");
  const [prescriptionText, setPrescriptionText] = useState("");
  const [images, setImages] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  function reset() {
    setClinicalSummary("");
    setPatientActivity("");
    setPrescriptionText("");
    setImages([]);
    setPreview(null);
    setResult(null);
    setMessage("");
    setError("");
  }

  async function uploadImage(file) {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/carequest/upload-report-image", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setImages((current) => [
        ...current,
        { url: data.url, publicId: data.publicId, fileName: data.fileName, kind: "prescription" },
      ]);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runParse() {
    setBusy("parse");
    setError("");
    setMessage("");
    try {
      const result = await parseDoctorReportPreview({
        clinicalSummary,
        patientActivity,
        prescriptionText,
        images,
      });
      setPreview(result);
      setMessage(
        `AI parsed the report (${result.parseMode}). Review the medications below, then submit.`
      );
    } catch (parseError) {
      setError(parseError.message);
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    setBusy("submit");
    setError("");
    setMessage("");
    try {
      const submitted = await submitDoctorReport({
        appointmentId: appointment._id,
        clinicalSummary,
        patientActivity,
        prescriptionText,
        images,
      });
      setResult(submitted);
      if (submitted.created) {
        setMessage(
          "Report published, anchored and turned into a care plan. The patient's CareQuest is updated."
        );
        onDone?.(submitted);
      } else {
        setMessage("This exact report was already filed for this appointment.");
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy("");
    }
  }

  const canSubmit =
    clinicalSummary.trim().length > 0 && !result?.created && busy === "";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose?.();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Consultation report
          </DialogTitle>
          <DialogDescription>
            Document the visit for {appointment?.patient?.name || "this patient"}. Your
            report is anchored on the local chain so it cannot be later denied, and it
            becomes the patient's care plan.
          </DialogDescription>
        </DialogHeader>

        {result?.created ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#c9ddd2] bg-[#eef7f1] p-4 text-sm text-[#2f5c46]">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4" /> Report published
              </div>
              <p className="mt-1">
                Care plan v{result.plan?.versionNumber} created with{" "}
                {result.plan?.occurrenceCount} missions.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-[#fafbf8] p-3 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <Lock className="h-3.5 w-3.5" /> On-chain proof
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                hash {result.contentHash}
              </div>
              <div className="break-all font-mono text-[10px] text-muted-foreground">
                tx {result.blockchain?.txHash || result.blockchain?.status}
              </div>
            </div>
            <Button
              onClick={() => {
                reset();
                onClose?.();
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Consultation remarks (required)</Label>
              <Textarea
                rows={4}
                value={clinicalSummary}
                onChange={(event) => setClinicalSummary(event.target.value)}
                placeholder="What you observed, assessed and advised during this visit."
              />
            </div>

            <div className="space-y-2">
              <Label>Patient activity / advice</Label>
              <Textarea
                rows={3}
                value={patientActivity}
                onChange={(event) => setPatientActivity(event.target.value)}
                placeholder="e.g. Walk 30 minutes daily, reduce salt, sleep 7 hours."
              />
            </div>

            <div className="space-y-2">
              <Label>Prescription (typed)</Label>
              <Textarea
                rows={3}
                value={prescriptionText}
                onChange={(event) => setPrescriptionText(event.target.value)}
                placeholder="e.g. Tab. Metoprolol 50mg once daily"
              />
            </div>

            <div className="space-y-2">
              <Label>Prescription image (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => uploadImage(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === "upload"}
                >
                  {busy === "upload" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 h-4 w-4" />
                  )}
                  Attach prescription photo
                </Button>
                {images.map((image) => (
                  <span
                    key={image.url}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-[#fafbf8] px-2 py-1 text-[11px]"
                  >
                    <Paperclip className="h-3 w-3" /> {image.fileName || "image"}
                    <button
                      type="button"
                      className="ml-1 text-rose-400"
                      onClick={() =>
                        setImages((current) => current.filter((i) => i.url !== image.url))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Attached images are read with OCR and folded into the report; they are
                stored as evidence.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={runParse}
                disabled={busy !== "" || !clinicalSummary.trim()}
              >
                {busy === "parse" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Parse with AI
              </Button>
              <Button type="button" onClick={submit} disabled={!canSubmit}>
                {busy === "submit" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Submit report &amp; build care plan
              </Button>
            </div>

            {message ? (
              <div className="rounded-xl border border-border bg-[#fafbf8] px-3 py-2 text-sm text-muted-foreground">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {preview?.parsed ? (
              <div className="space-y-3 rounded-xl border border-border bg-[#fafbf8] p-4">
                <div className="cq-kicker">AI-STRUCTURED PREVIEW</div>
                {preview.parsed.needsReview || preview.warnings?.length ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <div className="flex items-center gap-1 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" /> Needs review
                    </div>
                    <ul className="mt-1 list-disc pl-4">
                      {(preview.warnings || []).map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {preview.parsed.medications?.length ? (
                  <div>
                    <div className="text-xs font-bold">Medications</div>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {preview.parsed.medications.map((med, index) => (
                        <li key={index}>
                          • {med.name}
                          {med.dose ? ` · ${med.dose}` : ""}
                          {med.frequency ? ` · ${med.frequency}` : ""}
                          {med.needsReview ? " (verify)" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {preview.parsed.conditions?.length ? (
                  <div>
                    <div className="text-xs font-bold">Conditions detected</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {preview.parsed.conditions.map((c) => c.label).join(", ")}
                    </div>
                  </div>
                ) : null}
                {preview.quizPreview?.length ? (
                  <div>
                    <div className="text-xs font-bold">
                      Knowledge check (4 questions from the quiz bank)
                    </div>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {preview.quizPreview.map((item) => (
                        <li key={item.questionId}>
                          • [{item.categoryTitle}] {item.question}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  AI only structures what you wrote. Correct answers never leave the server.
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
