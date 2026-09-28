"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ClipboardList, Loader2, Stethoscope, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { instantSignInAs } from "@/actions/demoAuthActions";

export default function InstantSignIn({ compact = false }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");

  const signInAs = async (role) => {
    setError("");
    setPending(role);
    try {
      await instantSignInAs(role);
      await refresh();
      const homes = {
        patient: "/patient",
        doctor: "/doctor",
        nurse: "/staff",
        coordinator: "/staff",
        hospital_admin: "/admin/carequest",
      };
      router.push(homes[role] || "/");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not start the demo session");
      setPending(null);
    }
  };

  const buttonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white text-foreground font-semibold hover:border-[#c4d4cb] hover:bg-primary-soft disabled:opacity-60 " +
    (compact ? "px-3 py-2.5 text-sm" : "px-4 py-2.5 text-sm");

  const entries = [
    ["patient", UserRound, "Demo Patient"],
    ["doctor", Stethoscope, "Demo Doctor"],
    ["nurse", ClipboardList, "Demo Nurse"],
    ["hospital_admin", Building2, "Demo Hospital Admin"],
  ];

  return (
    <div className={compact ? "" : "mt-4"}>
      {!compact ? <p className="mb-3 text-center text-xs text-muted-foreground">Synthetic judge accounts only.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map(([role, Icon, label]) => (
          <button
            key={role}
            type="button"
            onClick={() => signInAs(role)}
            disabled={pending !== null}
            className={buttonClass}
          >
            {pending === role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-primary" />}
            {pending === role ? "Starting..." : label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-[#eccccc] bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
