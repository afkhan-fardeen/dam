"use client";

import type { ReactNode } from "react";

type SideCardProps = {
  side: "left" | "right";
  children: ReactNode;
  className?: string;
};

/** Floating glass side card — hidden below 1180px (use TopBar More instead). */
export function SideCard({ side, children, className = "" }: SideCardProps) {
  const pos =
    side === "left"
      ? "left-7 right-auto"
      : "right-7 left-auto";

  return (
    <aside
      className={`glass hidden min-[1180px]:block fixed top-1/2 -translate-y-1/2 w-[236px] p-4 z-30 ${pos} ${className}`}
    >
      {children}
    </aside>
  );
}

type SideCardSectionProps = {
  label: string;
  children: ReactNode;
};

export function SideCardSection({ label, children }: SideCardSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="card-label px-2.5 pb-1">{label}</p>
      {children}
    </div>
  );
}
