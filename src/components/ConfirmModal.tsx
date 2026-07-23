"use client";

import { IconX } from "@tabler/icons-react";

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

/** Flat confirm dialog — replaces browser window.confirm. */
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
      <div className="modal-box max-w-sm rounded-none">
        <div className="flex items-start gap-3 mb-3">
          <h3 className="type-title flex-1">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <p className="type-body opacity-70 mb-5">{message}</p>
        <div className="modal-action mt-0">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btn-error" : "btn btn-primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
