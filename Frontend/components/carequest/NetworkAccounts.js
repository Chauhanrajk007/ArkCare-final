"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Copy,
  Loader2,
  LogIn,
  Stethoscope,
  Users,
} from "lucide-react";
import { instantEnterAs } from "@/actions/demoEntryActions";

function destinationFor(role) {
  if (role === "doctor") return "/doctor";
  if (role === "platform_admin") return "/admin/platform";
  return "/admin/hospital"; // hospital_admin
}

function CredentialCard({ name, subtitle, email, role, symbol, hospitalName }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function enter() {
    setBusy(true);
    setError("");
    try {
      await instantEnterAs(email);
      router.push(destinationFor(role));
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <article className="cq-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {symbol ? <span className="cq-pixel-label">{symbol}</span> : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-[#fafbf8] px-2 py-1.5">
        <code className="truncate text-[11px] text-muted-foreground">{email}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-muted-foreground hover:text-primary"
          title="Copy email"
        >
          {copied ? (
            <span className="text-[10px] font-bold text-success">copied</span>
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {hospitalName ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          at {hospitalName}
        </p>
      ) : null}

      {error ? <p className="mt-1.5 text-[11px] text-rose-600">{error}</p> : null}

      <Button
        className="mt-3 w-full"
        size="sm"
        onClick={enter}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogIn className="mr-2 h-3.5 w-3.5" />
        )}
        Enter dashboard
      </Button>
    </article>
  );
}

/**
 * The network directory: every hospital admin and every doctor as a one-click
 * card. Entering a card opens that account's real dashboard (with its isolated
 * hospital scope for admins, or the clinical workspace for doctors). Password
 * for every account is shown for manual login as well.
 */
export default function NetworkAccounts({ accounts }) {
  const [tab, setTab] = useState("hospitals");

  return (
    <div className="space-y-6 pb-24 lg:pb-4">
      <section className="cq-card cq-reveal p-5 md:p-6">
        <div className="cq-kicker">NETWORK DIRECTORY</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Enter any dashboard
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          One-click into any hospital admin or doctor in the network. Each hospital
          admin sees only their own hospital; each doctor opens their clinical
          workspace. Manual login password for every account:{" "}
          <code className="rounded bg-[#f5f1e7] px-1.5 py-0.5 text-xs">
            {accounts.demoPassword}
          </code>
        </p>
      </section>

      <div className="flex gap-2">
        <Button
          variant={tab === "hospitals" ? "default" : "outline"}
          onClick={() => setTab("hospitals")}
        >
          <Building2 className="mr-2 h-4 w-4" /> Hospitals ({accounts.hospitals.length})
        </Button>
        <Button
          variant={tab === "doctors" ? "default" : "outline"}
          onClick={() => setTab("doctors")}
        >
          <Stethoscope className="mr-2 h-4 w-4" /> Doctors ({accounts.doctors.length})
        </Button>
      </div>

      {tab === "hospitals" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.hospitals.map((hospital) => (
            <CredentialCard
              key={hospital._id}
              name={hospital.name}
              subtitle="Hospital admin"
              email={hospital.adminEmail}
              role="hospital_admin"
              symbol={hospital.symbol}
            />
          ))}
          {accounts.platformAdminEmail ? (
            <CredentialCard
              name="ArkCare Network (master)"
              subtitle="Platform admin — every hospital"
              email={accounts.platformAdminEmail}
              role="platform_admin"
              symbol="ALL"
            />
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.doctors.map((doctor) => (
            <CredentialCard
              key={doctor._id}
              name={doctor.name}
              subtitle={`${doctor.specialization} · ${doctor.experience} yrs`}
              email={doctor.email}
              role="doctor"
              hospitalName={doctor.hospitalName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
