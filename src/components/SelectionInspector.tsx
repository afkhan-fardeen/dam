"use client";

import { IconX } from "@tabler/icons-react";
import type { Asset, Folder } from "@/lib/types";

type SelectionInspectorProps = {
  assets: Asset[];
  folder: Folder | null;
  spaceName: string;
  onClear: () => void;
  onOpenAsset?: (asset: Asset) => void;
};

function formatBytes(n: number | null | undefined) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SelectionInspector({
  assets,
  folder,
  spaceName,
  onClear,
  onOpenAsset,
}: SelectionInspectorProps) {
  if (assets.length === 0 && !folder) return null;

  const single = assets.length === 1 ? assets[0] : null;

  return (
    <aside className="inspector-panel hidden lg:flex flex-col w-[300px] shrink-0 max-h-[calc(100vh-var(--bar-h)-var(--dock-h)-2rem)] sticky top-2 overflow-y-auto p-4 gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-title">
          {assets.length > 1
            ? `${assets.length} selected`
            : single
              ? "Details"
              : "Folder"}
        </h2>
        <button
          type="button"
          className="btn-flat-ghost !px-2 h-8"
          aria-label="Close inspector"
          onClick={onClear}
        >
          <IconX size={16} />
        </button>
      </div>

      {assets.length > 1 ? (
        <div className="flex flex-col gap-2">
          <p className="type-caption">
            {assets.filter((a) => a.mime_type?.startsWith("image/")).length}{" "}
            images ·{" "}
            {assets.filter((a) => !a.mime_type?.startsWith("image/")).length}{" "}
            files
          </p>
          <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {assets.slice(0, 20).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="menu-row !px-2"
                  onClick={() => onOpenAsset?.(a)}
                >
                  <span className="truncate type-body">{a.original_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {single ? (
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="type-label">Name</dt>
            <dd className="type-body mt-1 break-words">{single.original_name}</dd>
          </div>
          <div>
            <dt className="type-label">Space</dt>
            <dd className="type-caption mt-1">{spaceName}</dd>
          </div>
          <div>
            <dt className="type-label">Size</dt>
            <dd className="type-caption mt-1">{formatBytes(single.size)}</dd>
          </div>
          <div>
            <dt className="type-label">Type</dt>
            <dd className="type-caption mt-1">{single.mime_type || "—"}</dd>
          </div>
          {single.brand ? (
            <div>
              <dt className="type-label">Brand</dt>
              <dd className="type-caption mt-1">{single.brand}</dd>
            </div>
          ) : null}
          {single.tags && single.tags.length > 0 ? (
            <div>
              <dt className="type-label">Tags</dt>
              <dd className="flex flex-wrap gap-1 mt-1">
                {single.tags.map((t) => (
                  <span key={t.id} className="tag-chip">
                    {t.name}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {single.description ? (
            <div>
              <dt className="type-label">Description</dt>
              <dd className="type-caption mt-1">{single.description}</dd>
            </div>
          ) : null}
          <button
            type="button"
            className="btn-flat-primary h-9 mt-2"
            onClick={() => onOpenAsset?.(single)}
          >
            Open preview
          </button>
        </dl>
      ) : null}

      {!single && folder ? (
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="type-label">Folder</dt>
            <dd className="type-body mt-1">{folder.name}</dd>
          </div>
          {folder.brand ? (
            <div>
              <dt className="type-label">Brand</dt>
              <dd className="type-caption mt-1">{folder.brand}</dd>
            </div>
          ) : null}
          {folder.description ? (
            <div>
              <dt className="type-label">Description</dt>
              <dd className="type-caption mt-1">{folder.description}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </aside>
  );
}
