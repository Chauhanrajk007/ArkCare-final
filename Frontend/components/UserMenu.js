"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function initials(name) {
  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Replaces Clerk's `<UserButton />` — shows the signed-in account and a sign-out
 * action, styled to match the dashboards.
 */
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted transition-colors"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white text-xs font-semibold">
          {initials(user.fullName)}
        </span>
        <span className="hidden sm:block text-sm text-zinc-200 max-w-[10rem] truncate">
          {user.fullName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-white truncate">
              {user.fullName}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {user.primaryEmailAddress?.emailAddress}
            </p>
            {user.publicMetadata?.role && (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px] font-medium capitalize">
                <UserIcon className="h-3 w-3" />
                {user.publicMetadata.role}
              </span>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-200 hover:bg-muted transition-colors disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 text-green-400" />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
