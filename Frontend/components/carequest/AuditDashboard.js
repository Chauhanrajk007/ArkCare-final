"use client";

import { useState } from "react";
import {
  Blocks,
  Fingerprint,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  anchorPendingAuditEvents,
  getAuditOverview,
} from "@/actions/auditActions";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import SimulationBadge from "@/components/carequest/SimulationBadge";

export default function AuditDashboard({ initialData }) {
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reaction, setReaction] = useState("idle");

  async function refresh() {
    setData(await getAuditOverview());
  }

  async function anchor() {
    setBusy(true);
    setMessage("");
    try {
      const result = await anchorPendingAuditEvents();
      setMessage(
        result.message ||
          (result.status === "confirmed"
            ? "Audit commitment confirmed on the configured blockchain."
            : "Audit batch prepared; blockchain may be disabled or unavailable.")
      );
      setReaction(result.status === "confirmed" ? "celebrate" : "wave");
      await refresh();
    } catch (error) {
      setMessage(error.message);
      setReaction("alert");
    } finally {
      setBusy(false);
      setTimeout(() => setReaction("idle"), 1400);
    }
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="cq-pixel-label">PROVENANCE</span>
              <SimulationBadge real>REAL PUBLIC BLOCKCHAIN</SimulationBadge>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">
              CareQuest audit & integrity
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {data.organization?.name || "This hospital"} sees only its own provenance
              chain and anchor batches. The trail detects changes inside its trust model;
              it does not prove that a self-reported health action happened in the
              physical world.
            </p>
          </div>
          <PixelCharacter
            variant="guardian"
            mood={reaction}
            size={94}
            speech={data.verification.valid ? "Hash chain is internally consistent." : "Integrity check needs review."}
          />
        </div>
      </section>

      {message ? (
        <div className="cq-achievement rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      {data.legacyUnscopedExcluded ? (
        <div className="rounded-xl border border-[#e5dbc2] bg-[#faf6ea] px-4 py-3 text-xs leading-5 text-muted-foreground">
          Legacy unscoped audit records are intentionally excluded from this hospital
          view rather than being exposed across tenants.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="cq-card p-5">
          <Fingerprint className="h-5 w-5 text-primary" />
          <div className="mt-5 text-3xl font-black">
            {data.verification.valid ? "VALID" : "CHECK"}
          </div>
          <div className="mt-1 text-sm font-bold">Hash-chain status</div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.verification.checked} events recomputed
          </p>
        </div>
        <div className="cq-card p-5">
          <Blocks className="h-5 w-5 text-[#817996]" />
          <div className="mt-5 text-3xl font-black">
            {data.blockchain?.ok ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="mt-1 text-sm font-bold">
            {data.blockchain?.ok ? "Blockchain bridge" : "Bridge"}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.blockchain?.ok
              ? `chain ${data.blockchain.chainId} @ block ${data.blockchain.blockNumber}`
              : data.blockchain?.error || "optional proof rail"}
          </p>
        </div>
        <div className="cq-card p-5">
          <Link2 className="h-5 w-5 text-[#9a8150]" />
          <div className="mt-5 text-3xl font-black">{data.batches.length}</div>
          <div className="mt-1 text-sm font-bold">Anchor batches</div>
          <div className="mt-3 flex gap-2">
            <Button onClick={anchor} disabled={busy}>
              <ShieldCheck className="h-4 w-4" />
              {busy ? "Anchoring..." : "Anchor pending events"}
            </Button>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="cq-card p-5 md:p-6">
        <div className="cq-kicker">ANCHOR BATCHES</div>
        <h2 className="mt-1 text-xl font-black">Recent commitments</h2>
        <div className="mt-4 space-y-3">
          {data.batches.map((batch) => (
            <article key={batch._id} className="rounded-xl border border-border bg-[#fafbf8] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="cq-pixel-label">{batch.status}</span>
                <span className="cq-pixel-label cq-real-label">{batch.network}</span>
              </div>
              <div className="mt-3 font-mono text-xs text-muted-foreground">
                Batch {batch.batchId}
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                Root {batch.merkleRoot}
              </div>
              {batch.txHash ? (
                <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {data.blockchain?.explorer ? (
                    <a
                      href={`${data.blockchain.explorer}/tx/${batch.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Tx {batch.txHash}
                    </a>
                  ) : (
                    <>Tx {batch.txHash}</>
                  )}
                </div>
              ) : null}
            </article>
          ))}
          {!data.batches.length ? (
            <p className="text-sm text-muted-foreground">No audit batches anchored yet.</p>
          ) : null}
        </div>
      </section>

      <section className="cq-card p-5 md:p-6">
        <div className="cq-kicker">APPEND-ONLY EVENTS</div>
        <h2 className="mt-1 text-xl font-black">Recent provenance</h2>
        <div className="mt-4 space-y-2">
          {data.events.map((event) => (
            <article key={event.eventId} className="rounded-lg border border-border bg-white p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{event.eventType}</strong>
                <span className="text-muted-foreground">{event.resourceType}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {event.eventHash}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
