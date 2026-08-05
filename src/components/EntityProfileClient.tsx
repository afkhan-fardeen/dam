"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AssetCard } from "@/components/AssetCard";
import { EntityChip, entityTypeColor } from "@/components/EntityChip";
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
      <div className="p-5 type-body opacity-60">Loading entity…</div>
    );
  }

  if (error || !entity) {
    return (
      <div className="p-5 flex flex-col gap-3 max-w-lg">
        <h1 className="type-page">Entity not found</h1>
        <p className="type-body opacity-70">
          {error ||
            "This entity does not exist, or it was merged into another one. Search from the top bar, or open Admin → Entities if you need to find the merge target."}
        </p>
        <Link href="/" className="btn btn-primary btn-sm w-fit">
          Go home
        </Link>
      </div>
    );
  }

  const color = entityTypeColor(entity.entity_type?.name);

  return (
    <div className="flex flex-col gap-8 p-5 max-w-6xl">
      {/* Identity header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className="type-micro opacity-50">
            {entity.entity_type?.label || "Entity"}
          </span>
        </div>
        <h1 className="type-page">{entity.name}</h1>
        {entity.description ? (
          <p className="type-body opacity-70 max-w-2xl">{entity.description}</p>
        ) : null}
        {(entity.aliases?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entity.aliases.map((alias) => (
              <span
                key={alias}
                className="badge badge-sm badge-ghost type-caption opacity-70 font-normal"
              >
                {alias}
              </span>
            ))}
          </div>
        ) : null}
        {(entity.roles?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {entity.roles.map((r) => (
              <span key={r} className="type-caption opacity-50">
                {r}
              </span>
            ))}
          </div>
        ) : null}
        <div>
          <EntityChip entity={entity} href={null} />
        </div>
      </header>

      {/* Related documents */}
      <section className="flex flex-col gap-3">
        <h2 className="type-title">
          Related documents
          <span className="type-caption opacity-50 font-normal ml-2">
            {documents.length}
          </span>
        </h2>
        {documents.length === 0 ? (
          <p className="type-body opacity-60 py-4 max-w-xl">
            Documents linked to {entity.name} will show up here. Link one during
            upload (Relate to…) or from a file&apos;s details panel under
            Relations.
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

      {/* Related entities — data-only for now; teach empty */}
      <section className="flex flex-col gap-2">
        <h2 className="type-title">Related entities</h2>
        <p className="type-body opacity-60 max-w-xl">
          Entity-to-entity links are not shown in the UI yet. Merges and
          document relations are managed from Admin → Entities and file
          details.
        </p>
      </section>

      {/* Activity summary */}
      <section className="flex flex-col gap-2">
        <h2 className="type-title">Activity</h2>
        <p className="type-caption opacity-50">
          {documents.length} visible document
          {documents.length === 1 ? "" : "s"}
          {entity.created_at
            ? ` · Created ${new Date(entity.created_at).toLocaleDateString()}`
            : ""}
          {entity.updated_at
            ? ` · Updated ${new Date(entity.updated_at).toLocaleDateString()}`
            : ""}
        </p>
      </section>
    </div>
  );
}
