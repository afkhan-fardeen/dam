"use client";

import type { ReactNode } from "react";
import { IconLayoutGrid, IconList, IconPhoto } from "@tabler/icons-react";
import type { ViewMode } from "@/lib/uiPrefs";

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const MODES: { id: ViewMode; label: string; icon: ReactNode }[] = [
  { id: "grid", label: "Grid", icon: <IconLayoutGrid size={15} /> },
  { id: "list", label: "List", icon: <IconList size={15} /> },
  { id: "photos", label: "Photos", icon: <IconPhoto size={15} /> },
];

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="segmented" role="group" aria-label="View mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-label={m.label}
          aria-pressed={value === m.id}
          title={m.label}
          onClick={() => onChange(m.id)}
        >
          {m.icon}
        </button>
      ))}
    </div>
  );
}
