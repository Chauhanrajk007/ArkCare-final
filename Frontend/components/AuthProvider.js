"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Client-side auth context. Replaces `@clerk/nextjs`'s `ClerkProvider` +
 * `useUser()`.
 *
 * The user object intentionally mirrors Clerk's shape (`id`, `fullName`,
 * `primaryEmailAddress.emailAddress`, `publicMetadata.role`) so components that
 * read `user.id` or `user.publicMetadata?.role` keep working unchanged.
 */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      const nextUser = data?.user ?? null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Another tab may have signed in or out; re-sync when this one regains focus.
  useEffect(() => {
    const onFocus = () => refresh();

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const signIn = useCallback(async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Could not sign you in");
    }

    setUser(data.user);
    return data.user;
  }, []);

  const signUp = useCallback(async ({ name, email, password }) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Could not create your account");
    }

    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoaded,
      isSignedIn: Boolean(user),
      isSignedOut: isLoaded && !user,
      role: user?.publicMetadata?.role ?? null,
      signIn,
      signUp,
      signOut,
      refresh,
    }),
    [user, isLoaded, signIn, signUp, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
