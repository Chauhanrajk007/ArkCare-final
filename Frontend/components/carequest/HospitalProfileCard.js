"use client";

import { Building2, Link2, ShieldCheck, Stethoscope, Users } from "lucide-react";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import CapsuleIcon from "@/components/carequest/CapsuleIcon";

/**
 * A hospital admin's own hospital: reputation (capsules earned by its patients,
 * a non-cash metric), the per-patient engagement leaderboard, and the hospital's
 * independent audit head. Scoped to the admin's assigned organization.
 */
export default function HospitalProfileCard({ profile }) {
  if (!profile) {
    return (
      <div className="cq-card border-dashed p-8 text-center text-sm text-muted-foreground">
        No hospital is assigned to this admin account yet.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="cq-kicker">HOSPITAL REPUTATION</div>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-black">
              <Building2 className="h-7 w-7 text-primary" /> {profile.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Your hospital&apos;s reputation is the participation its own patients have
              generated. It reflects engagement and trust — it is never a claimable
              balance, and Capsules remain hospital-specific, non-transferable units.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-sm font-bold text-success">
              <CapsuleIcon size={16} />
              {profile.reputationLabel} · reputation {profile.reputationScore}/100
            </p>
          </div>
          <PixelCharacter
            variant="guardian"
            mood="wave"
            size={90}
            speech="Every patient engagement counts toward your trust score."
          />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="cq-card p-5">
          <CapsuleIcon size={20} className="text-primary" />
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-black">{profile.totalCapsules}</span>
            <span className="pb-1 text-xs font-bold text-muted-foreground">
              {profile.symbol}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            earned by your patients (participation)
          </p>
        </div>
        <div className="cq-card p-5">
          <Users className="h-5 w-5 text-primary" />
          <div className="mt-3 text-4xl font-black">{profile.patientCount}</div>
          <p className="mt-1 text-xs text-muted-foreground">enrolled patients</p>
        </div>
        <div className="cq-card p-5">
          <Stethoscope className="h-5 w-5 text-primary" />
          <div className="mt-3 text-4xl font-black">{profile.doctorCount}</div>
          <p className="mt-1 text-xs text-muted-foreground">doctors on your roster</p>
        </div>
        <div className="cq-card p-5">
          <ShieldCheck className="h-5 w-5 text-success" />
          <div className="mt-3 text-4xl font-black">
            {profile.chainValid ? "VALID" : "CHECK"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            your audit chain ({profile.chainChecked} events)
          </p>
        </div>
      </section>

      <section className="cq-card p-5 md:p-6">
        <div className="cq-kicker">PATIENT ENGAGEMENT</div>
        <h2 className="mt-1 text-xl font-black">Top participating patients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recognising consistent participation — not health outcomes.
        </p>
        <div className="mt-4 space-y-2">
          {profile.leaderboard.map((row, index) => (
            <div
              key={row.patientId}
              className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="cq-pixel-label">#{index + 1}</span>
                <span className="font-semibold">{row.patientName}</span>
              </span>
              <span className="flex items-center gap-1 font-bold">
                <CapsuleIcon size={14} className="text-primary" />
                {row.capsules} {profile.symbol}
              </span>
            </div>
          ))}
          {!profile.leaderboard.length ? (
            <p className="text-sm text-muted-foreground">
              No capsule activity recorded yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="cq-card p-5 md:p-6">
        <div className="cq-kicker">INDEPENDENT AUDIT</div>
        <h2 className="mt-1 text-xl font-black">This hospital&apos;s chain</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every hospital verifies its own append-only audit chain, separate from all
          other hospitals.
        </p>
        <div className="mt-3 break-all rounded-lg border border-border bg-[#fafbf8] p-3 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1 font-bold text-foreground">
            <Link2 className="h-3 w-3" /> head {profile.headHash || "—"}
          </span>
        </div>
      </section>
    </div>
  );
}
