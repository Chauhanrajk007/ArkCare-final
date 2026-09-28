"use client";

import { useState } from "react";
import { Gift, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import { redeemCareBenefit } from "@/actions/programActions";

function requestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "redeem-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export default function BenefitCatalog({ programCard, onChanged }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [reaction, setReaction] = useState("idle");

  async function redeem(item) {
    setBusy(item._id);
    setMessage("");
    try {
      const result = await redeemCareBenefit(
        programCard.program._id,
        item._id,
        requestKey()
      );
      setReaction("celebrate");
      setMessage(
        "Benefit confirmed. " +
          item.costCapsules +
          " " +
          programCard.program.capsuleSymbol +
          " were recorded as a redemption."
      );
      onChanged?.(result);
      window.dispatchEvent(new Event("arkcare-capsules"));
    } catch (error) {
      setReaction("alert");
      setMessage(error.message);
    } finally {
      setBusy("");
      setTimeout(() => setReaction("idle"), 1600);
    }
  }

  return (
    <section className="cq-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="cq-kicker">FUNDED BENEFITS</div>
          <h2 className="mt-1 text-xl font-black">
            Use {programCard.program.capsuleSymbol} at this hospital
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Redemptions use this hospital program&apos;s funded budget. Capsules from another
            hospital cannot be spent here.
          </p>
        </div>
        <PixelCharacter variant="guide" mood={reaction} size={66} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {(programCard.catalog || []).map((item) => {
          const canAfford = programCard.balance >= item.costCapsules;
          return (
            <article key={item._id} className="rounded-xl border border-border bg-[#fafbf8] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#f4efdf] text-[#8a7346]">
                  <Gift className="h-4 w-4" />
                </div>
                <span className="cq-pixel-label">
                  {item.costCapsules} {programCard.program.capsuleSymbol}
                </span>
              </div>
              <h3 className="mt-4 font-bold">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              <Button
                className="mt-4 w-full"
                variant={canAfford ? "default" : "outline"}
                disabled={!canAfford || busy !== ""}
                onClick={() => redeem(item)}
              >
                {busy === item._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {canAfford ? "Redeem funded benefit" : "More Capsules needed"}
              </Button>
            </article>
          );
        })}
      </div>

      {message ? (
        <div className="cq-achievement mt-4 rounded-xl border border-border bg-primary-soft px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      ) : null}
    </section>
  );
}
