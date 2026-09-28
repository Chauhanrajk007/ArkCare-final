"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ScanLine, ShieldCheck } from "lucide-react";

export default function ScannerPage() {
  const [scannerUrl, setScannerUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SCANNER_URL;

    if (!url) {
      setError("Scanner service is not configured for this environment.");
      setLoading(false);
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Unsupported scanner URL");
      }

      if (parsedUrl.hostname.includes("ngrok")) {
        parsedUrl.searchParams.set("ngrok-skip-browser-warning", "true");
      }

      setScannerUrl(parsedUrl.toString());
    } catch {
      setError("Scanner service URL is invalid.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="ark-page min-h-screen p-3 md:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1600px] flex-col gap-3">
        <header className="surface-panel flex items-center justify-between rounded-2xl border px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/patient"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              aria-label="Back to patient dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10">
              <ScanLine className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <h1 className="font-bold text-white">ArkCare Scanner</h1>
              <p className="text-xs text-muted-foreground">Capture layer for future verified records</p>
            </div>
          </div>
          <span className="status-chip hidden sm:inline-flex">Scanner module</span>
        </header>

        <section className="surface-panel relative flex flex-1 overflow-hidden rounded-2xl border">
          {loading ? (
            <div className="m-auto text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-cyan-200" />
              <p className="text-sm text-muted-foreground">Connecting scanner module...</p>
            </div>
          ) : error ? (
            <div className="m-auto max-w-md p-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-300/10">
                <ShieldCheck className="h-6 w-6 text-violet-200" />
              </div>
              <h2 className="text-xl font-bold text-white">Scanner module offline</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                Set NEXT_PUBLIC_SCANNER_URL to attach the external scanning service.
              </p>
            </div>
          ) : (
            <iframe
              src={scannerUrl}
              className="h-full min-h-[78vh] w-full border-0 bg-transparent"
              title="ArkCare Scanner Application"
              allow="camera"
            />
          )}
        </section>
      </div>
    </main>
  );
}
