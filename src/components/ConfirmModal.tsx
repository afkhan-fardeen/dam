"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

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
    <Modal
      title={title}
      description={message}
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
