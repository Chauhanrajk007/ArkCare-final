"use client";

import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";

export default function SocketProvider({ children }) {
  useSocket();

  return <>{children}</>;
}
