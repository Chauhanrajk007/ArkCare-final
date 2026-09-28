"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Stethoscope, Video, Search } from "lucide-react";

/**
 * Browse every approved doctor grouped by their niche (specialty), so a patient
 * can enter a specialty and meet a clinician. Booking a slot from a niche card
 * starts the real consultation flow; the video meeting itself happens in the
 * appointment chat (that is where the shared chat + Agora token live).
 */
export default function DoctorDirectory({ doctors, organizationName }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.name, d.specialization, d.category, ...(d.qualifications || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [doctors, query]);

  const byNiche = useMemo(() => {
    const groups = new Map();
    for (const doctor of filtered) {
      const niche = doctor.category || doctor.specialization || "General";
      if (!groups.has(niche)) groups.set(niche, []);
      groups.get(niche).push(doctor);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="cq-kicker">DOCTOR DIRECTORY</div>
            <h1 className="mt-2 text-2xl font-black">Meet a clinician by niche</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every approved doctor at {organizationName || "this hospital"}. Enter a
              niche, then book a slot to open a video consultation.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search doctor or niche"
              className="w-64 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
      </section>

      {byNiche.length === 0 ? (
        <div className="cq-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No doctors match &ldquo;{query}&rdquo;.
        </div>
      ) : null}

      {byNiche.map(([niche, list]) => (
        <section key={niche} className="space-y-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-black">{niche}</h2>
            <span className="cq-pixel-label">{list.length} doctor(s)</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((doctor) => (
              <article key={doctor.doctor_id} className="cq-card p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{doctor.name}</h3>
                    <p className="text-xs font-semibold text-primary">
                      {doctor.specialization}
                    </p>
                    {doctor.experience ? (
                      <p className="text-xs text-muted-foreground">
                        {doctor.experience} yrs experience
                      </p>
                    ) : null}
                  </div>
                </div>
                {doctor.qualifications?.length ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {doctor.qualifications.join(" · ")}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between">
                  <span className="cq-pixel-label">
                    {doctor.consultationFee ? `₹${doctor.consultationFee}` : "—"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = "/patient?tab=find-doctors";
                    }}
                  >
                    <Video className="mr-1.5 h-3.5 w-3.5" /> Book &amp; meet
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-muted-foreground">
        Booking a slot creates your appointment; open it from{" "}
        <Link href="/patient" className="font-semibold text-primary">
          My Appointments
        </Link>{" "}
        and press the video button to start a secure call.
      </p>
    </div>
  );
}
