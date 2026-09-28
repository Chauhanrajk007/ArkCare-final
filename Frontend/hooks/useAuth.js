"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/AuthProvider";

/**
 * Drop-in replacement for Clerk's `useUser()`.
 *
 * Returns `{ user, isLoaded, isSignedIn, isSignedOut, role, signIn, signUp, signOut, refresh }`.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}
