"use client";

import { useEffect, useRef, useState } from "react";
import { getCapsuleGauge } from "@/actions/reportActions";
import { WalletCards } from "lucide-react";
import CapsuleIcon from "@/components/carequest/CapsuleIcon";

/**
 * Animated capsule gauge shown in the top-right of the CareQuest shell.
 * The bar fills slowly toward CAPSULE_DISPLAY_MAX (2000). It polls the server
 * balance and animates whenever the balance changes, so completing a quiz,
 * job or activity visibly moves the bar.
 */
export default function CapsuleGauge({ max = 2000, refreshSignal = 0 }) {
  const [state, setState] = useState({ balance: 0, symbol: "", programName: "" });
  const [bump, setBump] = useState(false);
  const previous = useRef(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await getCapsuleGauge();
        if (!active) return;
        setState((current) => {
          if (Number(next.balance) > current.balance) {
            setBump(true);
            setTimeout(() => setBump(false), 700);
          }
          previous.current = Number(next.balance) || 0;
          return { balance: Number(next.balance) || 0, symbol: next.symbol, programName: next.programName };
        });
      } catch {
        // Gauge is decorative; the dashboard balance stays authoritative.
      }
    }

    load();
    const interval = setInterval(load, 7000);
    const onFocus = () => load();
    // Any capsule-affecting action (mission Done, lesson, quiz, redeem) fires
    // this event so the gauge updates instantly instead of waiting for the poll.
    const onCapsules = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("arkcare-capsules", onCapsules);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("arkcare-capsules", onCapsules);
    };
  }, [refreshSignal]);

  const pct = Math.max(0, Math.min(100, (state.balance / max) * 100));

  return (
    <div className="cq-capsule-gauge" title={`${state.balance} / ${max} ${state.symbol}`}>
      <div className="flex items-center justify-between gap-2">
        <div
          className="cq-capsule-chip text-sm font-black"
          data-bump={bump ? "true" : "false"}
        >
          <WalletCards className="h-4 w-4 text-primary" />
          <span>{state.balance}</span>
          <CapsuleIcon size={14} className="text-primary" title="Capsules" />
          <span className="text-[11px] font-bold text-muted-foreground">
            {state.symbol || "CAP"}
          </span>
        </div>
        <div className="text-[10px] font-bold text-muted-foreground">
          {Math.round(pct)}% of {max}
        </div>
      </div>
      <div className="cq-capsule-bar mt-1.5">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
