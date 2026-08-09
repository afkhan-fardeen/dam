"use client";

import { getTagChipStyles } from "@/lib/categories";

type TagChipProps = {
  name: string;
  onRemove?: () => void;
  variant?: "glass" | "accent" | "flat";
};

export function TagChip({ name, onRemove, variant = "flat" }: TagChipProps) {
  const style =
    variant === "accent" ? getTagChipStyles(name).style : undefined;

  return (
    <span className="tag-chip" style={style}>
      {name}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          className="opacity-60 hover:opacity-100 ml-0.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function SpaceBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="space-badge"
      style={{ color, borderColor: color }}
    >
      {name}
    </span>
  );
}
