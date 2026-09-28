"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import RoleSelection from "@/components/RoleSelection";
import PixelCareScene from "@/components/carequest/PixelCareScene";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import SimulationBadge from "@/components/carequest/SimulationBadge";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  Coins,
  HeartHandshake,
  HeartPulse,
  Network,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  WalletCards,
} from "lucide-react";

const careLoop = [
  {
    icon: Stethoscope,
    step: "01",
    title: "Clinician approves",
    text: "CareQuest begins from a versioned care plan. AI can draft; the doctor remains the publishing authority.",
  },
  {
    icon: BookOpenCheck,
    step: "02",
    title: "Patient participates",
    text: "Lessons, check-ins, planned follow-ups and suitable activities become a calm guided journey.",
  },
  {
    icon: HeartHandshake,
    step: "03",
    title: "Difficulty becomes care",
    text: "Need Help creates one owned human handoff instead of silently treating a missed task as failure.",
  },
  {
    icon: BarChart3,
    step: "04",
    title: "Hospital learns",
    text: "Operations, rewards and actual payment evidence stay separate so engagement never masquerades as revenue.",
  },
];

const roles = [
  ["Patient", "A gentle mission journey, hospital-specific Capsules, benefits and fast access to human help."],
  ["Doctor", "Versioned care plans, AI draft review, approval authority and clinical escalations without routine noise."],
  ["Care team", "A prioritized handoff queue with ownership, contact history, shift reassignment and resolution."],
  ["Hospital", "Program budgets, engagement, operations, reward liability, finance separation and audit integrity."],
];

export default function Home() {
  const { isLoaded, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !user) return;
    const role = user.publicMetadata?.role;
    if (role === "patient") router.replace("/patient");
    if (role === "doctor") router.replace("/doctor");
    if (role === "nurse" || role === "coordinator") router.replace("/staff");
    if (role === "hospital_admin") router.replace("/admin/carequest");
  }, [isLoaded, user, router]);

  return (
    <main className="ark-page">
      <section className="px-4 pb-16 pt-5 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <nav className="cq-reveal flex items-center justify-between rounded-2xl border border-border bg-white/90 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#cfddd5] bg-[#e7f0eb]">
                <HeartPulse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-black tracking-[.08em]">ARKCARE</div>
                <div className="text-[10px] font-bold text-muted-foreground">CAREQUEST CARE OS</div>
              </div>
            </div>
            <a
              href="#enter"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Enter demo <ArrowRight className="h-4 w-4" />
            </a>
          </nav>

          <div className="grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
            <div className="cq-reveal">
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="cq-pixel-label">CLINICIAN APPROVED</span>
                <span className="cq-pixel-label">HUMAN HANDOFFS</span>
                <span className="cq-pixel-label cq-real-label">REAL PUBLIC EVM</span>
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[.98] tracking-[-.055em] text-foreground md:text-7xl">
                Care after the consult,
                <span className="text-primary"> built like a journey.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                ArkCare turns doctor-approved plans into clear missions, rewards honest
                participation with hospital-specific Capsules, and converts patient
                difficulty into real care-team action.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <a
                  href="#enter"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-hover"
                >
                  Explore CareQuest <Sparkles className="h-4 w-4" />
                </a>
                <div className="text-xs leading-5 text-muted-foreground">
                  No patient leaderboard. No punishment for honest non-completion.
                </div>
              </div>

              <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-white/70 p-3 sm:max-w-xl">
                <PixelCharacter variant="guide" mood="wave" size={58} />
                <p className="text-sm leading-6 text-muted-foreground">
                  “Done”, “Not done” and “Need help” all count as participation.
                  CareQuest rewards communication—not pretending everything went well.
                </p>
              </div>
            </div>

            <div className="cq-reveal cq-reveal-delay-1">
              <PixelCareScene />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white/55 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <div className="cq-kicker">THE CARE LOOP</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              Gamification that ends in real healthcare workflow.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {careLoop.map(({ icon: Icon, step, title, text }, index) => (
              <article key={title} className={"cq-card cq-reveal p-5 cq-reveal-delay-" + Math.min(index, 3)}>
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs font-black text-muted-foreground">{step}</span>
                </div>
                <h3 className="mt-7 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <div className="cq-kicker">MULTI-HOSPITAL PASSPORT</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              One patient. Separate hospital journeys.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              Each hospital controls its own program, budget and benefit catalog.
              Balances stay independent and never imply access to another hospital&apos;s
              clinical records.
            </p>
            <div className="mt-6">
              <PixelCharacter
                variant="walker"
                mood="idle"
                size={88}
                speech="Your care passport keeps every hospital program separate."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                hospital: "ArkCare City Hospital",
                symbol: "CITY",
                balance: 34,
                missions: 3,
                accent: "bg-[#e6efeb]",
              },
              {
                hospital: "Lotus Heart Institute",
                symbol: "LOTUS",
                balance: 12,
                missions: 1,
                accent: "bg-[#eeebf3]",
              },
            ].map((card) => (
              <article key={card.symbol} className="cq-card overflow-hidden p-5">
                <div className={"-mx-5 -mt-5 mb-5 h-2 " + card.accent} />
                <div className="flex items-center justify-between gap-3">
                  <Building2 className="h-5 w-5 text-primary" />
                  <span className="cq-pixel-label">{card.symbol}</span>
                </div>
                <h3 className="mt-5 font-bold">{card.hospital}</h3>
                <div className="mt-5 text-4xl font-black tracking-tight">{card.balance}</div>
                <div className="text-xs font-bold text-muted-foreground">{card.symbol} CAPSULES</div>
                <div className="cq-progress mt-5"><span style={{ width: card.symbol === "CITY" ? "68%" : "31%" }} /></div>
                <div className="mt-3 text-xs text-muted-foreground">{card.missions} active mission(s)</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-[#f2f4ef] px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_.95fr]">
          <div className="cq-card cq-grid-paper p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <SimulationBadge>SIMULATED DEVICE</SimulationBadge>
              <SimulationBadge>SIMULATED COMPUTE</SimulationBadge>
              <SimulationBadge>SIMULATED MARKET</SimulationBadge>
            </div>
            <div className="mt-7 flex items-end justify-between gap-3">
              <div>
                <div className="cq-kicker">ACTIVE ACTIVITY MISSION</div>
                <h3 className="mt-2 text-2xl font-black">3,842 / 5,000 steps</h3>
                <p className="mt-2 text-sm text-muted-foreground">Demo Health Connect · last sync 10:42</p>
              </div>
              <PixelCharacter variant="walker" mood="wave" size={84} />
            </div>
            <div className="cq-progress mt-6 h-3"><span style={{ width: "76%" }} /></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["18.4 H/s", "virtual hash rate"],
                ["1,429", "virtual work units"],
                ["+3 CITY", "Capsules at goal"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-border bg-white/90 p-4">
                  <div className="text-xl font-black">{value}</div>
                  <div className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="cq-kicker">CONCEPT SIMULATION</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              Show the future idea without pretending the phone is mining today.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              The demo simulates wearable sync, proof-of-work metrics and external token
              value. The actual CareQuest backend after that boundary�?"eligibility,
              idempotency, hospital Capsules, budgets, audit and on-chain settlement�?"is
              implemented as real application logic.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              Real and simulated ledgers remain visibly separate.
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="cq-kicker">BUILT FOR EVERY ROLE</div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {roles.map(([title, text], index) => (
              <article key={title} className="cq-card flex gap-4 p-5">
                <div className="font-mono text-xs font-black text-primary">0{index + 1}</div>
                <div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white/65 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <article className="cq-card p-6">
            <WalletCards className="h-5 w-5 text-primary" />
            <h3 className="mt-5 text-xl font-bold">Funded patient benefits</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Hospital-specific reward budgets and redemptions stay separate from token
              supply and actual consultation payments.
            </p>
          </article>
          <article className="cq-card p-6">
            <Network className="h-5 w-5 text-[#817996]" />
            <h3 className="mt-5 text-xl font-bold">Blockchain with boundaries</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Solidity/EVM proof rails on a public testnet support Capsules and audit
              commitments while clinical content remains off-chain.
            </p>
          </article>
          <article className="cq-card p-6">
            <Coins className="h-5 w-5 text-[#9a8150]" />
            <h3 className="mt-5 text-xl font-bold">Economics you can explain</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Actual payments, reward costs and simulated compute economics are shown as
              distinct systems instead of one inflated revenue number.
            </p>
          </article>
        </div>
      </section>

      <section id="enter" className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[1.8rem] border border-border bg-white/90 p-5 shadow-sm md:p-8 lg:grid-cols-[.8fr_1.2fr]">
          <div className="flex flex-col justify-center">
            <div className="cq-kicker">ENTER THE CARE NETWORK</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Pick a demo role.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The seeded demo world lets judges move between the patient journey,
              clinical plan approval, staff handoffs and hospital program analytics.
            </p>
            <div className="mt-5">
              <PixelCharacter variant="guide" mood="celebrate" size={86} speech="Ready when you are." />
            </div>
          </div>
          <RoleSelection />
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 text-xs text-muted-foreground md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 sm:flex-row">
          <span>ArkCare · CareQuest 2026</span>
          <span>Clinician authority · honest participation · human handoffs · auditable rewards</span>
        </div>
      </footer>
    </main>
  );
}
