"use client";

import type { ReactNode } from "react";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";

export type DockItem = {
  id: string;
  label?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  onDisabledClick?: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  dividerBefore?: boolean;
  /** Ignored — Flat has no breathe */
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
      className={`dock-pill fixed bottom-0 left-0 right-0 z-40 w-full max-w-none translate-x-0 justify-center overflow-x-auto ${className}`}
      style={{ viewTransitionName: "flat-dock" }}
      aria-label="Primary actions"
    >
      <div className="flex items-stretch justify-center min-w-0 mx-auto">
        {items.map((item) => {
          const cls = [
            "dock-btn",
            item.primary ? "dock-btn-primary" : "",
            item.active && !item.primary ? "dock-btn-active" : "",
            item.disabled ? "opacity-40" : "",
          ]
            .filter(Boolean)
            .join(" ");

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
                {item.icon}
                {item.label ? (
                  <span className="type-micro !text-inherit">{item.label}</span>
                ) : null}
              </button>
            </span>
          );
        })}
      </div>
    </nav>
  );
}
