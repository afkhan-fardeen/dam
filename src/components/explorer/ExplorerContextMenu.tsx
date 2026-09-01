"use client";

import { useEffect, useRef } from "react";

export type ExplorerMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
};

type Props = {
  x: number;
  y: number;
  items: ExplorerMenuItem[];
  onClose: () => void;
};

export function ExplorerContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  return (
    <div
      ref={ref}
      className="xp-ctx"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="xp-ctx-sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`xp-ctx-item${item.danger ? " is-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
