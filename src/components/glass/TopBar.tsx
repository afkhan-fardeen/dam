"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type TopBarProps = {
  brandHref?: string;
  brandLabel?: string;
  trailing?: ReactNode;
  more?: ReactNode;
};

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TopBar({
  brandHref = "/",
  brandLabel = "Company assets",
  trailing,
  more,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header
      className="h-[52px] shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 relative z-40"
      style={{ viewTransitionName: "glass-topbar" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={brandHref}
          className="type-title truncate hover:opacity-80 transition-opacity"
        >
          {brandLabel}
        </Link>
        {more}
      </div>
      <div className="flex items-center gap-3 shrink-0">
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
