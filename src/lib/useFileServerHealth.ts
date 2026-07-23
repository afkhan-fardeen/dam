"use client";

import { useEffect, useState } from "react";

export type ServerStatus = "checking" | "connected" | "offline";

const POLL_MS = 20_000;

function healthUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_FILE_API_BASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/health`;
}

export function useFileServerHealth() {
  const [status, setStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    const url = healthUrl();
    if (!url) {
      setStatus("offline");
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(url!, {
          method: "GET",
          cache: "no-store",
          headers: {
            "ngrok-skip-browser-warning": "true",
            "User-Agent": "DAM-HealthCheck/1.0",
          },
        });
        if (!cancelled) setStatus(res.ok ? "connected" : "offline");
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
