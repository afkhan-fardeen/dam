"use client";

import type { ReactNode } from "react";
import { useViewTransitionNavigate } from "@/components/glass/useViewTransitionNavigate";

export type DockItem = {
  id: string;
  label?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Fired when the item is disabled but clicked (e.g. explain why Upload is blocked). */
  onDisabledClick?: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  dividerBefore?: boolean;
  /** Soft shadow breathe on primary enabled actions (Upload). */
  breathe?: boolean;
};

type DockProps = {
  items: DockItem[];
  className?: string;
};

export function Dock({ items, className = "" }: DockProps) {
  const navigate = useViewTransitionNavigate();

  return (
    <nav
      className={`dock-pill fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] overflow-x-auto ${className}`}
      style={{ viewTransitionName: "glass-dock" }}
      aria-label="Primary actions"
    >
      {items.map((item) => {
        const cls = [
          "dock-btn",
          item.primary ? "dock-btn-primary" : "",
          item.active && !item.primary ? "dock-btn-active" : "",
          item.disabled ? "opacity-40" : "",
          item.breathe && item.primary && !item.disabled
            ? "dock-btn-breathe"
            : "",
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
            <button
              type="button"
              className={cls}
              title={item.title || item.label}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) {
                  item.onDisabledClick?.();
                  return;
                }
                item.onClick?.();
                if (item.href) navigate(item.href);
              }}
            >
              {content}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
