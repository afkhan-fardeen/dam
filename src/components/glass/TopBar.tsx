"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ServerStatus } from "@/lib/useFileServerHealth";

type TopBarProps = {
  brandHref?: string;
  /** Empty string / omit hides the brand link */
  brandLabel?: string;
  trailing?: ReactNode;
  more?: ReactNode;
  /** Windows file-server / PC tunnel health */
  serverStatus?: ServerStatus;
};

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusCopy(status: ServerStatus): { label: string; color: string } {
  switch (status) {
    case "connected":
      return { label: "PC connected", color: "#34c759" };
    case "checking":
      return { label: "Checking PC…", color: "#a1a1a6" };
    default:
      return { label: "PC offline", color: "#ff3b30" };
  }
}

export function TopBar({
  brandHref = "/",
  brandLabel = "",
  trailing,
  more,
  serverStatus,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const status = serverStatus ? statusCopy(serverStatus) : null;
  const showBrand = Boolean(brandLabel?.trim());

  return (
    <header
      className="h-[52px] shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 relative z-40"
      style={{ viewTransitionName: "glass-topbar" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {showBrand ? (
          <Link
            href={brandHref}
            className="type-title truncate hover:opacity-80 transition-opacity"
          >
            {brandLabel}
          </Link>
        ) : (
          <span className="w-0" aria-hidden />
        )}
        {more}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {status ? (
          <div
            className="flex items-center gap-1.5 type-caption"
            title={
              status.label === "PC offline"
                ? "Windows file server is unreachable — uploads and previews may fail"
                : status.label === "PC connected"
                  ? "Windows file server is online"
                  : "Checking Windows file server…"
            }
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: status.color }}
              aria-hidden
            />
            <span className="hidden sm:inline">{status.label}</span>
          </div>
        ) : null}
        <time
          className="type-caption tabular-nums hidden sm:block"
          dateTime={now.toISOString()}
        >
          {formatClock(now)}
        </time>
        {trailing}
      </div>
    </header>
  );
}
