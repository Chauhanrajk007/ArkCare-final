"use client";

import { useEffect } from "react";

export function useSocket() {
  useEffect(() => {
    // For production deployment, we'll use a different approach
    // Socket.io doesn't work well with Vercel's serverless functions
    if (process.env.NODE_ENV === "development") {
      // Only try to initialize socket in development
      fetch("/api/socket").catch(console.error);
    }
  }, []);
}
