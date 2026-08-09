"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "destructive"
  | "ghost"
  | "glass";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-flat-primary",
  secondary: "btn-flat",
  glass: "btn-flat",
  danger: "btn-flat-danger",
  destructive: "btn-flat-destructive",
  ghost: "btn-flat-ghost",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} inline-flex items-center justify-center gap-2 px-4 h-9 text-[13px] font-semibold disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** @deprecated Use Button */
export const GlassButton = Button;
