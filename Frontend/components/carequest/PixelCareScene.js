import PixelCharacter from "@/components/carequest/PixelCharacter";
import { Activity, Coins, HeartPulse, ShieldCheck } from "lucide-react";

export default function PixelCareScene({ compact = false }) {
  return (
    <div className="cq-grid-paper relative overflow-hidden rounded-[1.7rem] border border-border bg-[#f9faf6] p-5 md:p-7">
      <div className="absolute left-0 right-0 top-[64%] h-px bg-[#d8e2dc]" />
      <div className="absolute bottom-0 left-0 right-0 h-[34%] bg-[#eef3ed]" />
      <div className="relative z-10 flex min-h-[260px] items-end justify-between gap-3">
        <div className="mb-8 hidden rounded-xl border border-border bg-white/90 p-3 sm:block">
          <HeartPulse className="h-5 w-5 text-primary" />
          <div className="mt-4 text-xs font-bold">PLAN</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Doctor approved</div>
        </div>
        <PixelCharacter variant="doctor" mood="wave" size={compact ? 70 : 92} />
        <div className="mb-12 flex flex-col items-center">
          <div className="cq-pixel-label cq-real-label mb-2">+2 CAP</div>
          <PixelCharacter variant="guide" mood="celebrate" size={compact ? 78 : 106} />
        </div>
        <PixelCharacter variant="nurse" mood="idle" size={compact ? 70 : 92} />
        <div className="mb-8 hidden rounded-xl border border-border bg-white/90 p-3 sm:block">
          <ShieldCheck className="h-5 w-5 text-[#817996]" />
          <div className="mt-4 text-xs font-bold">HANDOFF</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Human care team</div>
        </div>
      </div>
      <div className="relative z-10 mt-3 grid grid-cols-3 gap-2">
        {[
          [Activity, "Mission"],
          [Coins, "Capsules"],
          [ShieldCheck, "Audit"],
        ].map(([Icon, label]) => (
          <div key={label} className="rounded-lg border border-border bg-white/85 p-2 text-center">
            <Icon className="mx-auto h-4 w-4 text-primary" />
            <div className="mt-1 text-[10px] font-bold text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
