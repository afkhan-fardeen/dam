"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AssetCard } from "@/components/AssetCard";
import { EntityChip, entityTypeColor } from "@/components/EntityChip";
import { GlassButton } from "@/components/glass/GlassButton";
import type { Asset, Entity } from "@/lib/types";

type EntityProfileClientProps = {
  entityId: string;
};

export function EntityProfileClient({ entityId }: EntityProfileClientProps) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [documents, setDocuments] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities/${entityId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load this entity.");
      setEntity(json.entity as Entity);
      setDocuments((json.documents ?? []) as Asset[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load this entity. Go home and try again.",
      );
      setEntity(null);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto glass-strong p-8 glass-appear">
        <p className="type-body text-[var(--ink-soft)]">Loading entity…</p>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="max-w-lg mx-auto glass-strong p-8 glass-appear flex flex-col gap-3">
        <h1 className="type-page">Entity not found</h1>
        <p className="type-body text-[var(--ink-soft)]">
          {error ||
            "This entity does not exist, or it was merged into another one."}
        </p>
        <GlassButton variant="primary" onClick={() => { window.location.href = "/"; }}>
          Go home
        </GlassButton>
      </div>
    );
  }

  const color = entityTypeColor(entity.entity_type?.name);

  return (
    <div className="max-w-4xl mx-auto glass-strong p-6 sm:p-8 glass-appear flex flex-col gap-8 mb-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className="card-label !normal-case !tracking-normal !font-medium">
            {entity.entity_type?.label || "Entity"}
          </span>
        </div>
        <h1 className="type-page">{entity.name}</h1>
        {entity.description ? (
          <p className="type-body text-[var(--ink-soft)] max-w-2xl">
            {entity.description}
          </p>
        ) : null}
        {(entity.aliases?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entity.aliases.map((alias) => (
              <span key={alias} className="tag-chip text-[var(--ink-faint)]">
                {alias}
              </span>
            ))}
          </div>
        ) : null}
        {(entity.roles?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {entity.roles.map((r) => (
              <span key={r} className="type-caption">
                {r}
              </span>
            ))}
          </div>
        ) : null}
        <div>
          <EntityChip entity={entity} href={null} />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="type-title">
          Related documents
          <span className="type-caption font-normal ml-2">{documents.length}</span>
        </h2>
        {documents.length === 0 ? (
          <p className="type-body text-[var(--ink-soft)] py-2 max-w-xl">
            Documents linked to {entity.name} will show up here. Link one during
            upload or from a file&apos;s details panel.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
            {documents.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                thumbnailUrl={
                  asset.has_thumbnail
                    ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                    : null
                }
                onClick={() => {
                  window.location.href = `/search?q=${encodeURIComponent(asset.original_name || "")}`;
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="type-title">Related entities</h2>
        <p className="type-body text-[var(--ink-soft)] max-w-xl">
          Entity-to-entity links are not shown in the UI yet.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="card-label">Activity</h2>
        <div className="card-row cursor-default">
          <span className="flex-1 font-normal">
            {documents.length} visible document
            {documents.length === 1 ? "" : "s"}
          </span>
          <span className="type-caption">
            {entity.updated_at
              ? new Date(entity.updated_at).toLocaleDateString()
              : entity.created_at
                ? new Date(entity.created_at).toLocaleDateString()
                : ""}
          </span>
        </div>
      </section>

      <div>
        <Link href="/" className="dock-btn inline-flex">
          ← Home
        </Link>
      </div>
    </div>
  );
}
