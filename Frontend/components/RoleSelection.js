"use client";

import { ArrowRight, ShieldCheck, Sparkles, Stethoscope, Users } from "lucide-react";
import { setUserRole } from "@/actions/userActions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import InstantSignIn from "@/components/InstantSignIn";

const PENDING_ROLE_KEY = "arkcare:pendingRole";

const roles = [
  {
    id: "patient",
    icon: Users,
    label: "Patient path",
    description: "Care Passport, missions, hospital Capsules, benefits and your approved care journey.",
    tags: ["CareQuest", "Appointments", "Reports"],
  },
  {
    id: "doctor",
    icon: Stethoscope,
    label: "Doctor path",
    description: "Appointments, versioned care plans, AI draft review and clinical escalations.",
    tags: ["Care plans", "Approval", "Escalations"],
  },
];

export default function RoleSelection() {
  const { isLoaded, isSignedIn, refresh } = useAuth();
  const [loading, setLoading] = useState(null);
  const router = useRouter();

  const applyRole = async (role) => {
    setLoading(role);
    try {
      const result = await setUserRole(role);
      await refresh();
      if (result?.needsOnboarding) router.push("/doctor/onboarding");
      else router.push(role === "doctor" ? "/doctor" : "/patient");
    } catch (error) {
      console.error("Error setting role:", error);
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn || loading) return;
    const pendingRole = window.localStorage.getItem(PENDING_ROLE_KEY);
    if (!pendingRole) return;
    window.localStorage.removeItem(PENDING_ROLE_KEY);
    applyRole(pendingRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const handleRoleSelection = async (role) => {
    if (!isSignedIn) {
      const currentUser = await refresh();
      if (currentUser) {
        await applyRole(role);
        return;
      }
      window.localStorage.setItem(PENDING_ROLE_KEY, role);
      router.push("/sign-in?next=%2F");
      return;
    }
    await applyRole(role);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {roles.map(({ id, icon: Icon, label, description, tags }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleRoleSelection(id)}
            disabled={loading !== null}
            className="cq-card group min-h-[210px] p-5 text-left hover:-translate-y-0.5 disabled:opacity-60"
          >
            <div className="flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary" />
            </div>

            <h3 className="mt-6 text-lg font-bold">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => <span key={tag} className="cq-pixel-label">{tag}</span>)}
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs font-bold text-primary">
              {loading === id ? (
                <><Sparkles className="h-3.5 w-3.5 animate-pulse" /> Preparing...</>
              ) : (
                <><ShieldCheck className="h-3.5 w-3.5" /> {isSignedIn ? "Continue" : "Sign in to continue"}</>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-[#fafbf8] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#817996]">
          <Sparkles className="h-3.5 w-3.5" />
          ONE-CLICK JUDGE DEMO
        </div>
        <InstantSignIn compact />
      </div>
    </div>
  );
}
