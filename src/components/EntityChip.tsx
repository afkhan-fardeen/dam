"use client";

import Link from "next/link";
import type { Entity } from "@/lib/types";

/** Entity-type accent dots (design-01 §2.1) */
const TYPE_ACCENT: Record<string, string> = {
  organization: "#c77dff",
  person: "#0071e3",
  campaign: "#2fb3a3",
  product: "#4f6bff",
  project: "#ff6b4a",
  location: "#1f8a5f",
  supplier: "#ff3b30",
  agency: "#c77dff",
};

export function entityTypeColor(typeName?: string | null): string {
  if (!typeName) return "var(--ink-soft)";
  return TYPE_ACCENT[typeName] ?? "var(--ink-soft)";
}

type EntityChipProps = {
  entity: Entity & { relation_label?: string | null };
  href?: string | null;
  onRemove?: () => void;
  readOnly?: boolean;
};

export function EntityChip({
  entity,
  href,
  onRemove,
  readOnly,
}: EntityChipProps) {
  const color = entityTypeColor(entity.entity_type?.name);
  const to = href === null ? null : href ?? `/e/${entity.id}`;
  const label = entity.entity_type?.label || "Entity";

  const inner = (
    <span className="entity-chip group/chip" title={entity.relation_label || label}>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{entity.name}</span>
      {entity.relation_label ? (
        <>
          <span className="text-[var(--ink-faint)] opacity-40">·</span>
          <span className="text-[var(--ink-faint)]">{entity.relation_label}</span>
        </>
      ) : null}
      {onRemove && !readOnly ? (
        <button
          type="button"
          className="opacity-0 group-hover/chip:opacity-70 hover:!opacity-100 ml-0.5 text-[var(--ink-faint)]"
          aria-label={`Remove ${entity.name}`}
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

  if (to) {
    return (
      <Link href={to} className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}
