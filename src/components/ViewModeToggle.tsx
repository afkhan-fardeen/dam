"use client";

import { IconLayoutGrid, IconList } from "@tabler/icons-react";
import type { ViewMode } from "@/lib/uiPrefs";

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="join">
      <button
        type="button"
        aria-label="Grid view"
        className={`btn btn-sm btn-ghost join-item ${
          value === "grid" ? "btn-active" : ""
        }`}
        onClick={() => onChange("grid")}
      >
        <IconLayoutGrid size={16} />
      </button>
      <button
        type="button"
        aria-label="List view"
        className={`btn btn-sm btn-ghost join-item ${
          value === "list" ? "btn-active" : ""
        }`}
        onClick={() => onChange("list")}
      >
        <IconList size={16} />
      </button>
    </div>
  );
}
