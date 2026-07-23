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

/** DaisyUI admin modal — scrollable body, sticky footer, escape to close. */
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
      <div
        className={`modal-box flex flex-col max-h-[min(90vh,640px)] p-0 ${
          size === "lg" ? "max-w-lg" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-2">
          <h2 className="type-title flex-1">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">{children}</div>
        {footer ? (
          <div className="modal-action shrink-0 px-5 py-4 mt-0">{footer}</div>
        ) : null}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
