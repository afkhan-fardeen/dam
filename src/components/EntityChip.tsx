"use client";

import Link from "next/link";
import type { Entity } from "@/lib/types";

/** Accent token per entity type — DaisyUI theme colors only, never full chip fill. */
const TYPE_ACCENT: Record<string, string> = {
  organization: "var(--color-primary)",
  person: "var(--color-success)",
  campaign: "var(--color-warning)",
  product: "var(--color-primary)",
  project: "var(--color-base-content)",
  location: "var(--color-base-content)",
  supplier: "var(--color-error)",
  agency: "var(--color-primary)",
};

export function entityTypeColor(typeName?: string | null): string {
  if (!typeName) return "var(--color-base-content)";
  return TYPE_ACCENT[typeName] ?? "var(--color-base-content)";
}

type EntityChipProps = {
  entity: Entity & { relation_label?: string | null };
  href?: string | null;
  onRemove?: () => void;
  readOnly?: boolean;
};

/**
 * Family with tag chips: same badge height/padding; differentiate by accent
 * icon + navigation, not a competing visual system.
 */
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
    <span
      className="badge badge-sm gap-1.5 font-normal bg-base-200 text-base-content border-0 group/chip"
      title={entity.relation_label || label}
    >
      <span
        className="h-1.5 w-1.5 shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="type-body font-normal">{entity.name}</span>
      {entity.relation_label ? (
        <span className="type-caption opacity-50">{entity.relation_label}</span>
      ) : null}
      {onRemove && !readOnly ? (
        <button
          type="button"
          className="opacity-0 group-hover/chip:opacity-70 hover:!opacity-100 ml-0.5 type-caption"
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
      <Link href={to} className="inline-flex hover:opacity-80">
        {inner}
      </Link>
    );
  }
  return inner;
}
