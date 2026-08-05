"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

type AdminModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Wider panel for forms with many fields */
  size?: "md" | "lg";
};

export function AdminModal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: AdminModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-open"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <div
        className={`modal-box flex flex-col max-h-[min(90vh,640px)] p-0 glass-strong glass-appear !bg-[var(--glass-strong)] border-0 shadow-none ${
          size === "lg" ? "max-w-lg" : "max-w-md"
        }`}
        style={{ borderRadius: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-2">
          <h2 className="type-title flex-1">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="dock-btn !px-2"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">{children}</div>
        {footer ? (
          <div className="shrink-0 px-5 py-4 flex justify-end gap-2">{footer}</div>
        ) : null}
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="submit" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
