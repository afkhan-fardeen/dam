"use client";

import { getTagChipStyles } from "@/lib/categories";

type TagChipProps = {
  name: string;
  onRemove?: () => void;
  /** Soft glass pill (default) vs accent-tinted space-style badge */
  variant?: "glass" | "accent";
};

export function TagChip({ name, onRemove, variant = "glass" }: TagChipProps) {
  if (variant === "accent") {
    const { style } = getTagChipStyles(name);
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

  return (
    <span className="tag-chip">
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

type SpaceBadgeProps = {
  name: string;
  color: string;
};

export function SpaceBadge({ name, color }: SpaceBadgeProps) {
  return (
    <span
      className="space-badge"
      style={{
        background: `${color}1f`,
        color,
      }}
    >
      {name}
    </span>
  );
}
