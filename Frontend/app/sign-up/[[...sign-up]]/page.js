"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, HeartPulse, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      await signUp({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not create your account");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[.045] px-4 py-3 text-white placeholder:text-muted-foreground outline-none";

  return (
    <main className="ark-page flex min-h-screen items-center px-4 py-10 md:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <section className="surface-panel rounded-[1.75rem] border p-5 md:p-8 lg:p-10">
          <div className="mx-auto max-w-md">
            <Link href="/" className="mb-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to ArkCare
            </Link>

            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
                <HeartPulse className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200/70">New profile</p>
                <h1 className="text-2xl font-black">Start your ArkCare journey</h1>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                ["name", "Full name", "text", "Ada Lovelace", "name"],
                ["email", "Email", "email", "you@example.com", "email"],
                ["password", "Password", "password", "At least 8 characters", "new-password"],
                ["confirmPassword", "Confirm password", "password", "Re-enter password", "new-password"],
              ].map(([field, label, type, placeholder, autoComplete]) => (
                <div key={field}>
                  <label htmlFor={field} className="mb-2 block text-sm font-semibold text-zinc-200">{label}</label>
                  <input
                    id={field}
                    name={field}
                    type={type}
                    autoComplete={autoComplete}
                    required
                    minLength={type === "password" ? 8 : undefined}
                    value={form[field]}
                    onChange={update(field)}
                    placeholder={placeholder}
                    className={inputClass}
                  />
                </div>
              ))}

              {error && (
                <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-green-500 py-3 font-bold text-white disabled:opacity-60"
              >
                {submitting ? "Creating care profile..." : "Create profile"}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-muted-foreground">
              Already have a profile?{" "}
              <Link href="/sign-in" className="font-semibold text-cyan-200 hover:text-white">Sign in</Link>
            </p>
          </div>
        </section>

        <section className="surface-card hidden min-h-[650px] flex-col justify-between p-8 lg:flex">
          <div>
            <span className="status-chip">Journey initialization</span>
            <h2 className="mt-7 text-5xl font-black leading-[1.02] tracking-[-.045em]">
              Create identity.
              <span className="brand-text"> Choose your path.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Your account begins neutral. Next, choose patient or doctor and ArkCare provisions the right workspace.
            </p>
          </div>

          <div className="space-y-4">
            <div className="surface-panel rounded-2xl border p-5">
              <div className="flex items-center justify-between">
                <Activity className="h-5 w-5 text-cyan-200" />
                <span className="text-xs font-bold text-muted-foreground">STEP 01</span>
              </div>
              <h3 className="mt-5 font-bold">Identity</h3>
              <div className="progress-track mt-3"><span /></div>
            </div>
            <div className="surface-panel rounded-2xl border p-5">
              <div className="flex items-center justify-between">
                <Sparkles className="h-5 w-5 text-violet-200" />
                <span className="text-xs font-bold text-muted-foreground">STEP 02</span>
              </div>
              <h3 className="mt-5 font-bold">Role + care experience</h3>
              <p className="mt-2 text-sm text-muted-foreground">Unlocked immediately after registration.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
