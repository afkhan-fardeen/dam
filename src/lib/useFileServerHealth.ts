"use client";

import { useEffect, useState } from "react";

export type ServerStatus = "checking" | "connected" | "offline";

const POLL_MS = 20_000;

export function useFileServerHealth() {
  const [status, setStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/pc-health", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          connected?: boolean;
        } | null;
        if (!cancelled) {
          setStatus(json?.connected === true ? "connected" : "offline");
        }
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return status;
}
