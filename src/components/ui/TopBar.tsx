"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type TopBarProps = {
  brandHref?: string;
  brandLabel?: string;
  /** e.g. mobile nav toggle / collapse */
  leading?: ReactNode;
  /** Search or other primary control — left-aligned after leading */
  search?: ReactNode;
  /** @deprecated use search — kept for brief compat */
  center?: ReactNode;
  /** e.g. current place name */
  context?: ReactNode;
  trailing?: ReactNode;
  /** Show live date + time in the header */
  showClock?: boolean;
};

function formatClock(d: Date): { date: string; time: string } {
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return { date, time };
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { date, time } = formatClock(now);

  return (
    <time
      className="topbar-clock"
      dateTime={now.toISOString()}
      title={now.toLocaleString()}
    >
      <span className="topbar-clock-date">{date}</span>
      <span className="topbar-clock-sep" aria-hidden>
        ·
      </span>
      <span className="topbar-clock-time">{time}</span>
    </time>
  );
}

export function TopBar({
  brandHref = "/",
  brandLabel = "",
  leading,
  search,
  center,
  context,
  trailing,
  showClock = true,
}: TopBarProps) {
  const searchSlot = search ?? center;
  const hasSearch = Boolean(searchSlot);

  return (
    <header
      className={`topbar-flat${hasSearch ? " topbar-flat--search" : ""}`}
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
        {hasSearch ? (
          <div className="topbar-search">{searchSlot}</div>
        ) : null}
      </div>

      <div className="topbar-right">
        {showClock ? <HeaderClock /> : null}
        {trailing}
      </div>
    </header>
  );
}
