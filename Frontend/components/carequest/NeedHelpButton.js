"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  LifeBuoy,
  Link2,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
import { getMyHelpRequests, requestDirectHelp } from "@/actions/staffActions";
import { pusherClient } from "@/lib/pusher";
import { useAuth } from "@/hooks/useAuth";

const QUICK = [
  "I have a side effect from my medicine",
  "I need help understanding my prescription",
  "My symptoms are getting worse",
  "I want to talk to a nurse",
];

/**
 * Floating "Need Help" affordance for the patient. Raises a Need-Help handoff
 * that lands in the nurse/coordinator queue (and the doctor's view once
 * escalated). The request is content-hashed and anchored on-chain, and the
 * patient sees that proof plus the eventual resolution.
 */
export default function NeedHelpButton({ userId: userIdProp }) {
  const { user } = useAuth();
  const userId = userIdProp || user?.id || user?._id || "";
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [category, setCategory] = useState("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [mine, setMine] = useState([]);

  const load = useCallback(async () => {
    try {
      setMine(await getMyHelpRequests());
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Refresh the request list when staff update a case in realtime.
  useEffect(() => {
    if (!userId) return undefined;
    let channel;
    try {
      channel = pusherClient.subscribe("private-carequest-user-" + userId);
      channel.bind("mission.updated", load);
    } catch {}
    return () => {
      try {
        channel?.unbind("mission.updated", load);
        pusherClient.unsubscribe("private-carequest-user-" + userId);
      } catch {}
    };
  }, [userId, load]);

  async function send() {
    setBusy(true);
    setError("");
    setSent(null);
    try {
      const result = await requestDirectHelp({ problem, category });
      setSent(result);
      setProblem("");
      await load();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const openCount = mine.filter((c) => c.status !== "resolved").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cq-need-help-btn"
        title="Ask a nurse or your care team for help"
      >
        <LifeBuoy className="h-4 w-4" />
        <span className="text-xs font-bold">Need Help</span>
        {openCount > 0 ? (
          <span className="cq-need-help-badge">{openCount}</span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" /> Need help
            </DialogTitle>
            <DialogDescription>
              Tell a nurse (and your care team) what you need. Your request is hashed
              and anchored on the local chain so it can&apos;t be lost or quietly
              dropped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setProblem(text)}
                  className="cq-pixel-label hover:bg-muted"
                >
                  {text}
                </button>
              ))}
            </div>

            <Textarea
              rows={4}
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Describe what you need help with (non-emergency)."
            />

            <div className="flex flex-wrap gap-1.5">
              {["general", "medication", "symptoms", "appointment"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={
                    "cq-pixel-label " +
                    (category === c ? "cq-real-label" : "")
                  }
                >
                  {c}
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              disabled={busy || problem.trim().length < 4}
              onClick={send}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send to my care team
            </Button>

            {error ? <p className="text-xs text-rose-600">{error}</p> : null}

            {sent ? (
              <div className="rounded-xl border border-[#c9ddd2] bg-[#eef7f1] p-3 text-xs text-[#2f5c46]">
                <div className="flex items-center gap-1 font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Help request sent
                </div>
                <p className="mt-1">
                  A nurse will pick this up. Your request is on-chain
                  {sent.onChain === "anchored" ? " (anchored)" : ""}.
                </p>
                <p className="mt-1 break-all font-mono text-[10px]">
                  proof {String(sent.requestHash || "").slice(0, 20)}…
                </p>
              </div>
            ) : null}

            {mine.length ? (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="cq-kicker">MY REQUESTS</div>
                {mine.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-lg border border-border bg-[#fafbf8] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {item.status === "resolved" ? "Resolved" : "In progress"}
                      </span>
                      {item.resolution?.blockchain?.status === "anchored" ? (
                        <span className="cq-pixel-label cq-real-label">
                          <Link2 className="mr-1 h-3 w-3" /> on-chain
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-muted-foreground">{item.summary}</p>
                    {item.status === "resolved" && item.outcome ? (
                      <p className="mt-1 text-emerald-700">
                        Done: {item.outcome}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              For emergencies, use local emergency services — this is not urgent care.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
