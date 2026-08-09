"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";

type AdminModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
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
  return (
    <Modal title={title} onClose={onClose} footer={footer} size={size}>
      {children}
    </Modal>
  );
}
