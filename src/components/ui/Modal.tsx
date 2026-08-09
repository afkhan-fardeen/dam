"use client";

import { IconX } from "@tabler/icons-react";
import { useEffect, useState, type FormEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg";

type ModalProps = {
  title: string;
  /** Secondary line under the title */
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Disable dismiss (e.g. while saving) */
  closeDisabled?: boolean;
  /** Optional form wrapper — footer submit buttons work with type="submit" */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
};

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "flat-modal--sm",
  md: "flat-modal--md",
  lg: "flat-modal--lg",
};

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "sm",
  closeDisabled = false,
  onSubmit,
  className = "",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const panel = (
    <>
      <header className="flat-modal-header">
        <div className="flat-modal-heading min-w-0">
          <h2 className="flat-modal-title">{title}</h2>
          {description ? (
            <p className="flat-modal-desc">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="flat-modal-close"
          aria-label="Close"
          disabled={closeDisabled}
          onClick={onClose}
        >
          <IconX size={18} stroke={1.75} />
        </button>
      </header>
      {children ? <div className="flat-modal-body">{children}</div> : null}
      {footer ? <footer className="flat-modal-footer">{footer}</footer> : null}
    </>
  );

  const node = (
    <dialog
      className="modal modal-open flat-modal-host"
      onCancel={(e) => {
        e.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <div className="flat-scrim absolute inset-0 pointer-events-none" />
      {onSubmit ? (
        <form
          onSubmit={onSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`modal-box flat-modal ${SIZE_CLASS[size]} ${className}`.trim()}
        >
          {panel}
        </form>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`modal-box flat-modal ${SIZE_CLASS[size]} ${className}`.trim()}
        >
          {panel}
        </div>
      )}
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button
          type="button"
          disabled={closeDisabled}
          onClick={() => {
            if (!closeDisabled) onClose();
          }}
        >
          close
        </button>
      </form>
    </dialog>
  );

  if (!mounted) return null;
  return createPortal(node, document.body);
}
