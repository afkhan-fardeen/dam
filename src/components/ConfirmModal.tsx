"use client";

import { IconX } from "@tabler/icons-react";
import { GlassButton } from "@/components/glass/GlassButton";

type ConfirmModalProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Glass confirm dialog — Cancel + Confirm only. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="flat-scrim absolute inset-0 pointer-events-none" />
      <div
        className="modal-box max-w-sm surface flat-fade !bg-[var(--surface)] border-0 shadow-none"
        style={{ borderRadius: 6 }}
      >
        <div className="flex items-start gap-3 mb-3">
          <h3 className="type-title flex-1">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            className="dock-btn !px-2"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <p className="type-body text-[var(--ink-soft)] mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <GlassButton variant="glass" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </GlassButton>
          <GlassButton
            variant={danger ? "primary" : "primary"}
            disabled={busy}
            onClick={onConfirm}
            className={
              danger
                ? "!bg-[#ff3b30] !shadow-[0_4px_14px_-4px_rgba(255,59,48,0.45)]"
                : ""
            }
          >
            {busy ? "Working…" : confirmLabel}
          </GlassButton>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
