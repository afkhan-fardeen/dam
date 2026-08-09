"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ServerStatus } from "@/lib/useFileServerHealth";

type TopBarProps = {
  brandHref?: string;
  brandLabel?: string;
  /** e.g. mobile nav toggle */
  leading?: ReactNode;
  /** Slim search field (center) */
  center?: ReactNode;
  /** e.g. current place name */
  context?: ReactNode;
  trailing?: ReactNode;
  serverStatus?: ServerStatus;
};

function statusCopy(status: ServerStatus): { label: string; color: string } {
  switch (status) {
    case "connected":
      return { label: "PC connected", color: "var(--ok)" };
    case "checking":
      return { label: "Checking PC…", color: "var(--ink-faint)" };
    default:
      return { label: "PC offline", color: "var(--danger)" };
  }
}

export function TopBar({
  brandHref = "/",
  brandLabel = "Assets",
  leading,
  center,
  context,
  trailing,
  serverStatus,
}: TopBarProps) {
  const status = serverStatus ? statusCopy(serverStatus) : null;

  return (
    <header
      className={`topbar-flat${center ? "" : " topbar-flat--no-search"}`}
      style={{ viewTransitionName: "flat-topbar" }}
    >
      <div className="topbar-left">
        {leading}
        {brandLabel?.trim() ? (
          <Link href={brandHref} className="topbar-brand">
            {brandLabel}
          </Link>
        ) : null}
        {context ? <div className="topbar-context">{context}</div> : null}
      </div>

      {center ? <div className="topbar-center">{center}</div> : <div />}

      <div className="topbar-right">
        {status ? (
          <div
            className="topbar-status"
            title={
              status.label === "PC offline"
                ? "File server unavailable — uploads and previews may fail"
                : status.label === "PC connected"
                  ? "File server is online"
                  : "Checking file server…"
            }
          >
            <span
              className="topbar-status-dot"
              style={{ backgroundColor: status.color }}
              aria-hidden
            />
            <span className="topbar-status-label">{status.label}</span>
          </div>
        ) : null}
        {trailing}
      </div>
    </header>
  );
}
