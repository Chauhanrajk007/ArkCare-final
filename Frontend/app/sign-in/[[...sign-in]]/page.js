"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, HeartPulse, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import InstantSignIn from "@/components/InstantSignIn";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get("next") || "/";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not sign you in");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[.045] px-4 py-3 text-white placeholder:text-muted-foreground outline-none";

  return (
    <main className="ark-page flex min-h-screen items-center px-4 py-10 md:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <section className="surface-card hidden min-h-[650px] flex-col justify-between p-8 lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to ArkCare
            </Link>
            <div className="mt-16">
              <span className="status-chip">Session checkpoint</span>
              <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-[-.045em]">
                Resume your
                <span className="brand-text"> care journey.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                Your role, appointments, reports, conversations, and care tools continue from one secure session.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {["Identity-aware dashboards", "Private consultation channels", "Future reward rails ready"].map((item, index) => (
              <div key={item} className="surface-panel flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-zinc-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-300/10 text-xs font-bold text-cyan-200">
                  0{index + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel rounded-[1.75rem] border p-5 md:p-8 lg:p-10">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
                  <HeartPulse className="h-5 w-5 text-cyan-200" />
                </div>
                <div>
                  <div className="font-bold">ArkCare</div>
                  <div className="text-xs text-muted-foreground">Identity gateway</div>
                </div>
              </div>
              <ShieldCheck className="h-5 w-5 text-cyan-200/70" />
            </div>

            <div className="mb-7">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200/70">Welcome back</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Enter your care space</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your account or jump into the hackathon demo below.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-zinc-200">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-zinc-200">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>

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
                {submitting ? "Opening session..." : "Continue to ArkCare"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-white/10" />
              <span>JUDGE ACCESS</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <InstantSignIn compact />

            <p className="mt-7 text-center text-sm text-muted-foreground">
              New to ArkCare?{" "}
              <Link href="/sign-up" className="font-semibold text-cyan-200 hover:text-white">
                Create an account
              </Link>
            </p>

            <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Hackathon demo profiles contain synthetic demo data only.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
