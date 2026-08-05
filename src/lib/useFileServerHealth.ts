"use client";

import { useEffect, useState } from "react";

export type ServerStatus = "checking" | "connected" | "offline";

const POLL_MS = 20_000;
/** Keep “connected” through a single failed poll if we were ok recently. */
const GRACE_MS = 45_000;

export function useFileServerHealth() {
  const [status, setStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let lastOkAt = 0;
    let consecutiveFails = 0;

    async function check() {
      try {
        const res = await fetch("/api/pc-health", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          connected?: boolean;
        } | null;
        if (cancelled) return;

        if (json?.connected === true) {
          lastOkAt = Date.now();
          consecutiveFails = 0;
          setStatus("connected");
          return;
        }

        consecutiveFails += 1;
        const withinGrace =
          lastOkAt > 0 && Date.now() - lastOkAt < GRACE_MS && consecutiveFails < 2;
        setStatus(withinGrace ? "connected" : "offline");
      } catch {
        if (cancelled) return;
        consecutiveFails += 1;
        const withinGrace =
          lastOkAt > 0 && Date.now() - lastOkAt < GRACE_MS && consecutiveFails < 2;
        setStatus(withinGrace ? "connected" : "offline");
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
