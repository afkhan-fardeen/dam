"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "glass" | "danger";

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-glass-primary",
  glass: "btn-glass",
  danger: "btn-glass-danger",
};

export function GlassButton({
  variant = "glass",
  className = "",
  children,
  type = "button",
  ...rest
}: GlassButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium disabled:opacity-45 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
