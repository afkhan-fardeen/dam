"use client";

import type { ReactNode } from "react";
import { useViewTransitionNavigate } from "@/components/glass/useViewTransitionNavigate";

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
            <button
              type="button"
              className={cls}
              title={item.title || item.label}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
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
