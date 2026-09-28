"use client";

import { Building2, Gift, WalletCards } from "lucide-react";
import PixelCharacter from "@/components/carequest/PixelCharacter";

export default function CarePassport({ passport, selectedProgramId, onSelect }) {
  return (
    <section>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="cq-kicker">YOUR CARE PASSPORT</div>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Hospital programs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each hospital keeps its own Capsule balance, benefits and program terms.
          </p>
        </div>
        <PixelCharacter variant="guide" mood="idle" size={58} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(passport?.programs || []).map((card) => {
          const selected = String(card.program._id) === String(selectedProgramId);
          return (
            <button
              type="button"
              key={card.program._id}
              onClick={() => onSelect(card.program._id)}
              className={
                "cq-card overflow-hidden p-5 text-left " +
                (selected ? "border-[#9db6aa] ring-2 ring-[#dce9e2]" : "")
              }
            >
              <div
                className={
                  "-mx-5 -mt-5 mb-4 h-2 " +
                  (card.program.visualTheme?.accent === "lavender"
                    ? "bg-[#ded9e8]"
                    : "bg-[#d9e8e0]")
                }
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Building2 className="h-4 w-4 text-primary" />
                    {card.organization.name}
                  </div>
                  <h3 className="mt-2 text-lg font-bold">{card.program.name}</h3>
                </div>
                <span className="cq-pixel-label">{card.program.capsuleSymbol}</span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <div className="text-4xl font-black tracking-tight">{card.balance}</div>
                  <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                    {card.program.capsuleSymbol} CAPSULES
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <Gift className="h-4 w-4" />
                  {card.catalog?.length || 0} benefits
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary">
                <WalletCards className="h-4 w-4" />
                {selected ? "Current hospital context" : "Open this hospital journey"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
