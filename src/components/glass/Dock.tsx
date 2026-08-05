"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type DockItem = {
  id: string;
  label?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  dividerBefore?: boolean;
};

type DockProps = {
  items: DockItem[];
  className?: string;
};

export function Dock({ items, className = "" }: DockProps) {
  return (
    <nav
      className={`dock-pill fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] overflow-x-auto ${className}`}
      aria-label="Primary actions"
    >
      {items.map((item) => {
        const cls = [
          "dock-btn",
          item.primary ? "dock-btn-primary" : "",
          item.active && !item.primary ? "dock-btn-active" : "",
          item.disabled ? "opacity-40 pointer-events-none" : "",
          !item.label ? "px-3" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const content = (
          <>
            {item.icon}
            {item.label ? <span>{item.label}</span> : null}
          </>
        );

        return (
          <span key={item.id} className="contents">
            {item.dividerBefore ? <span className="dock-divider" /> : null}
            {item.href && !item.disabled ? (
              <Link
                href={item.href}
                className={cls}
                title={item.title || item.label}
                onClick={item.onClick}
              >
                {content}
              </Link>
            ) : (
              <button
                type="button"
                className={cls}
                title={item.title || item.label}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                {content}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
