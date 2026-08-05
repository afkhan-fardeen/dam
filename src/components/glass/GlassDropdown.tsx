"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type GlassDropdownProps = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  widthClass?: string;
  className?: string;
};

export function GlassDropdown({
  trigger,
  children,
  align = "right",
  widthClass = "w-[240px]",
  className = "",
}: GlassDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex items-center bg-transparent border-0 p-0 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-full mt-2 z-50 glass-strong glass-appear p-1.5 max-h-[min(70vh,420px)] overflow-y-auto ${widthClass} ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ borderRadius: 16 }}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}
