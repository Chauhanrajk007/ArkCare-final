"use client";

import { Building2, HeartPulse, Link2, ShieldCheck, Stethoscope, Users } from "lucide-react";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import CapsuleIcon from "@/components/carequest/CapsuleIcon";

/**
 * The public hospital network directory. Shows every hospital, its reputation
 * (capsules earned by its patients — a non-cash, non-transferable engagement
 * metric) and the fact that each keeps its own independent audit chain.
 */
export default function HospitalDirectory({ hospitals }) {
  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="cq-kicker">CAREQUEST NETWORK</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              Choose a hospital you trust
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Each hospital runs its own clinical program and its own audit chain.
              Reputation reflects the participation its patients have generated — it is
              a quality signal, never a cashable balance. Capsules are hospital-specific
              and cannot be transferred or cashed out.
            </p>
          </div>
          <PixelCharacter
            variant="guardian"
            mood="idle"
            size={88}
            speech={`${hospitals.length} hospitals in the network`}
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {hospitals.map((hospital, index) => (
          <article key={hospital.organizationId} className="cq-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cq-pixel-label">#{index + 1}</span>
                    <h3 className="text-lg font-black">{hospital.name}</h3>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-primary">
                    {hospital.reputationLabel} · reputation {hospital.reputationScore}/100
                  </p>
                </div>
              </div>
              {hospital.chainValid ? (
                <span className="cq-pixel-label cq-real-label">
                  <Link2 className="h-3 w-3" /> chain valid
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {hospital.about}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-black">
                  <CapsuleIcon size={15} className="text-primary" />
                  {hospital.totalCapsules}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {hospital.symbol} earned
                </div>
              </div>
              <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-black">
                  <Stethoscope className="h-4 w-4" />
                  {hospital.doctorCount}
                </div>
                <div className="text-[10px] text-muted-foreground">doctors</div>
              </div>
              <div className="rounded-lg border border-border bg-[#fafbf8] p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-black">
                  <Users className="h-4 w-4" />
                  {hospital.patientCount}
                </div>
                <div className="text-[10px] text-muted-foreground">patients</div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              {hospital.appointmentCount} appointments · {hospital.resolvedCases}{" "}
              handoffs resolved · own audit head verified
            </div>
          </article>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <HeartPulse className="h-3.5 w-3.5" />
        Reputation is participation, not a health score. A hospital cannot claim or
        cash out a share of your Capsules.
      </p>
    </div>
  );
}
