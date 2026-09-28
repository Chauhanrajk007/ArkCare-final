"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  HeartPulse,
  Home,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  WalletCards,
} from "lucide-react";
import UserMenu from "@/components/UserMenu";
import PixelCharacter from "@/components/carequest/PixelCharacter";
import CapsuleGauge from "@/components/carequest/CapsuleGauge";
import NeedHelpButton from "@/components/carequest/NeedHelpButton";

const NAV = {
  patient: [
    { href: "/patient", label: "Home", icon: Home },
    { href: "/patient/doctors", label: "Doctors", icon: Stethoscope },
    { href: "/patient/hospitals", label: "Hospitals", icon: Building2 },
    { href: "/patient/carequest", label: "CareQuest", icon: Sparkles },
    { href: "/patient/care-plans", label: "Care plan", icon: BookOpenCheck },
    { href: "/network", label: "Network", icon: Users },
  ],
  doctor: [
    { href: "/doctor", label: "Practice", icon: Stethoscope },
    { href: "/doctor/care-plans", label: "Care plans", icon: BookOpenCheck },
    { href: "/doctor/escalations", label: "Handoffs", icon: ClipboardList },
    { href: "/network", label: "Network", icon: Users },
  ],
  staff: [
    { href: "/staff", label: "Handoffs", icon: ClipboardList },
    { href: "/network", label: "Network", icon: Users },
  ],
  admin: [
    { href: "/admin/hospital", label: "My hospital", icon: Building2 },
    { href: "/admin/carequest", label: "Program", icon: BarChart3 },
    { href: "/admin/carequest/audit", label: "Audit", icon: ShieldCheck },
    { href: "/network", label: "Network", icon: Users },
  ],
  platform_admin: [
    { href: "/admin/platform", label: "Network", icon: Building2 },
    { href: "/network", label: "Directory", icon: Users },
  ],
};

const ROLE_META = {
  patient: { label: "Patient journey", variant: "guide" },
  doctor: { label: "Clinical workspace", variant: "doctor" },
  staff: { label: "Care operations", variant: "nurse" },
  admin: { label: "Hospital program", variant: "guardian" },
  platform_admin: { label: "Platform network", variant: "guardian" },
};

export default function CareQuestShell({
  role = "patient",
  title = "CareQuest",
  subtitle = "",
  children,
  actions = null,
}) {
  const pathname = usePathname();
  const links = NAV[role] || NAV.patient;
  const meta = ROLE_META[role] || ROLE_META.patient;

  return (
    <div className="cq-app-shell lg:grid lg:grid-cols-[238px_1fr]">
      <aside className="cq-sidebar hidden min-h-screen lg:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#d2ded7] bg-[#e7f0eb]">
              <HeartPulse className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-black tracking-[.08em] text-foreground">ARKCARE</div>
              <div className="text-[10px] font-semibold text-muted-foreground">CAREQUEST OS</div>
            </div>
          </Link>

          <div className="mt-5 rounded-xl border border-border bg-white/70 p-3">
            <PixelCharacter
              variant={meta.variant}
              mood="wave"
              size={52}
              speech={meta.label}
            />
          </div>

          <nav className="mt-6 space-y-1.5" aria-label="CareQuest navigation">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/patient" && href !== "/doctor" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className="cq-nav-link"
                  data-active={active ? "true" : "false"}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-border bg-[#f5f1e7] p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#735f38]">
              <WalletCards className="h-4 w-4" />
              Capsule programs
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              Hospital-specific balances stay separate from clinical decisions.
            </p>
            {role === "patient" ? (
              <Link
                href="/reports"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
              >
                <FileCheck2 className="h-3 w-3" /> Reports
              </Link>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="cq-topbar sticky top-0 z-40">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-7">
            <div className="min-w-0">
              <div className="cq-kicker">{meta.label}</div>
              <h1 className="truncate text-lg font-bold text-foreground md:text-xl">{title}</h1>
              {subtitle ? (
                <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              {role === "patient" ? <CapsuleGauge /> : null}
              {role === "patient" ? <NeedHelpButton /> : null}
              <UserMenu />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
          {children}
        </div>

        <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl border border-border bg-white/95 p-1.5 shadow-lg backdrop-blur lg:hidden">
          {links.slice(0, 4).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/patient" && href !== "/doctor" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold " +
                  (active ? "bg-primary-soft text-primary" : "text-muted-foreground")
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
