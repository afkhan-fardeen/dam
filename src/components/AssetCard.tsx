"use client";

import {
  IconDots,
  IconDownload,
  IconFileText,
  IconFolderFilled,
  IconLock,
  IconPhoto,
  IconPlayerPlay,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { getTagChipStyles } from "@/lib/categories";
import type { Asset } from "@/lib/types";

function FileTypeGlyph({ mimeType }: { mimeType: string | null }) {
  const mime = mimeType ?? "";
  if (mime.startsWith("video/")) {
    return <IconPlayerPlay size={18} stroke={1.75} className="text-primary" />;
  }
  if (mime.startsWith("image/")) {
    return <IconPhoto size={18} stroke={1.75} className="text-primary" />;
  }
  return <IconFileText size={18} stroke={1.75} className="text-primary" />;
}

function formatBytes(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export type AssetMenuAction = "rename" | "move" | "trash";

type AssetCardProps = {
  asset: Asset;
  thumbnailUrl?: string | null;
  onClick: () => void;
  onDoubleClick?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
  onToggleFavorite?: () => void;
  locked?: boolean;
  spaceName?: string | null;
  spaceColor?: string | null;
  layout?: "grid" | "list";
  /** Show space name column/chip (All files / search). */
  showSpace?: boolean;
  /** Show tags on the card (off by default — use page toggle). */
  showTags?: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  onDownload?: () => void;
  onMenuAction?: (action: AssetMenuAction) => void;
};

function FileActionsMenu({
  onMenuAction,
}: {
  onMenuAction: (action: AssetMenuAction) => void;
}) {
  return (
    <details className="dropdown dropdown-bottom dropdown-end">
      <summary
        className="btn btn-ghost btn-xs btn-square bg-base-100/90 list-none"
        aria-label="File actions"
        onClick={(e) => e.stopPropagation()}
      >
        <IconDots size={14} />
      </summary>
      <ul className="dropdown-content menu bg-base-100 z-[9999] w-44 p-2 shadow-lg border border-base-300 type-body">
        {(
          [
            { action: "rename" as const, label: "Rename" },
            { action: "move" as const, label: "Move to folder" },
            { action: "trash" as const, label: "Move to trash" },
          ] as { action: AssetMenuAction; label: string }[]
        ).map(({ action, label }) => (
          <li key={action}>
            <button
              type="button"
              className={action === "trash" ? "text-error" : ""}
              onClick={(e) => {
                e.stopPropagation();
                const root = (e.currentTarget as HTMLElement).closest(
                  "details",
                ) as HTMLDetailsElement | null;
                if (root) root.open = false;
                onMenuAction(action);
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ActionButtons({
  asset,
  canDownload,
  canEdit,
  onToggleFavorite,
  onDownload,
  onMenuAction,
  absolute,
}: {
  asset: Asset;
  canDownload: boolean;
  canEdit: boolean;
  onToggleFavorite?: () => void;
  onDownload?: () => void;
  onMenuAction?: (action: AssetMenuAction) => void;
  absolute?: boolean;
}) {
  const show =
    onToggleFavorite || (canDownload && onDownload) || (canEdit && onMenuAction);
  if (!show) return null;

  return (
    <div
      className={`flex items-center gap-0.5 shrink-0 ${
        absolute
          ? "absolute top-1 right-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:has-[details[open]]:opacity-100"
          : ""
      }`}
    >
      {onToggleFavorite ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle bg-base-100/90"
          aria-label={asset.favorited ? "Unstar" : "Star"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {asset.favorited ? (
            <IconStarFilled size={14} className="text-warning" />
          ) : (
            <IconStar size={14} />
          )}
        </button>
      ) : null}
      {canDownload && onDownload ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle bg-base-100/90"
          aria-label="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <IconDownload size={14} />
        </button>
      ) : null}
      {canEdit && onMenuAction ? (
        <FileActionsMenu onMenuAction={onMenuAction} />
      ) : null}
    </div>
  );
}

export function AssetCard({
  asset,
  thumbnailUrl,
  onClick,
  onDoubleClick,
  selected = false,
  selectionMode = false,
  onToggleSelect,
  onToggleFavorite,
  locked = false,
  spaceName = null,
  spaceColor = null,
  layout = "grid",
  showSpace = false,
  showTags = false,
  canDownload = false,
  canEdit = false,
  onDownload,
  onMenuAction,
}: AssetCardProps) {
  const name = asset.original_name || "Untitled file";
  const creator = asset.created_by;
  const tags = asset.tags ?? [];

  const actions =
    !locked && !selectionMode ? (
      <ActionButtons
        asset={asset}
        canDownload={canDownload}
        canEdit={canEdit}
        onToggleFavorite={onToggleFavorite}
        onDownload={onDownload}
        onMenuAction={onMenuAction}
        absolute={layout === "grid"}
      />
    ) : null;

  if (layout === "list") {
    return (
      <div
        className={`group flex items-center gap-3 px-3 py-2 rounded-box hover:bg-base-200 ${
          selected ? "bg-base-200" : ""
        }`}
      >
        {selectionMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            className="checkbox checkbox-sm checkbox-primary shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
        <button
          type="button"
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => {
            if (selectionMode) {
              onToggleSelect?.();
              return;
            }
            onClick();
          }}
          onDoubleClick={onDoubleClick}
        >
          <span className="shrink-0 w-8 h-8 bg-base-200 border border-base-300 flex items-center justify-center overflow-hidden">
            {thumbnailUrl && !locked ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <FileTypeGlyph mimeType={asset.mime_type} />
            )}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block type-label truncate">{name}</span>
            {creator && !locked ? (
              <span className="block type-caption opacity-60 truncate">
                By {creator}
              </span>
            ) : null}
            {showTags && tags.length > 0 && !locked ? (
              <span className="mt-0.5 flex flex-wrap gap-1">
                {tags.slice(0, 4).map((t) => {
                  const chip = getTagChipStyles(t.name);
                  return (
                    <span
                      key={t.id}
                      className="badge badge-sm font-normal"
                      style={chip.style}
                    >
                      {t.name}
                    </span>
                  );
                })}
              </span>
            ) : null}
          </span>
          {showSpace ? (
            <span
              className="type-caption shrink-0 w-28 hidden sm:inline-flex items-center gap-1.5 text-left opacity-80"
              title={spaceName || undefined}
            >
              {spaceColor ? (
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: spaceColor }}
                />
              ) : null}
              <span className="truncate">{spaceName || "—"}</span>
            </span>
          ) : null}
          <span className="type-caption opacity-60 w-16 shrink-0 text-right hidden md:inline tabular-nums">
            {formatBytes(asset.size)}
          </span>
          <span className="type-caption opacity-60 w-24 shrink-0 text-right hidden lg:inline">
            {formatDate(asset.created_at)}
          </span>
        </button>
        <div className="w-[5.5rem] shrink-0 flex justify-end">{actions}</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col text-left group w-full">
      {selectionMode ? (
        <label className="absolute top-1 left-1 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            className="checkbox checkbox-sm checkbox-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      ) : null}
      {actions}
      <button
        type="button"
        onClick={() => {
          if (selectionMode) {
            onToggleSelect?.();
            return;
          }
          onClick();
        }}
        onDoubleClick={onDoubleClick}
        className={`flex flex-col items-stretch text-left focus:outline-none rounded-box p-2 transition-colors w-full ${
          selected ? "bg-base-200" : "hover:bg-base-200"
        }`}
      >
        <div className="w-full aspect-[4/3] flex items-center justify-center bg-base-200 rounded-box overflow-hidden relative border border-base-300">
          {thumbnailUrl && !locked ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <FileTypeGlyph mimeType={asset.mime_type} />
          )}
          {locked ? (
            <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
              <IconLock size={22} className="text-white drop-shadow" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 pt-2 min-w-0">
          <p className="type-label truncate" title={name}>
            {name}
          </p>
          {showSpace && spaceName ? (
            <span className="type-caption opacity-70 w-fit max-w-full truncate inline-flex items-center gap-1.5">
              {spaceColor ? (
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: spaceColor }}
                />
              ) : null}
              {spaceName}
            </span>
          ) : null}
          {creator && !locked ? (
            <p className="type-caption opacity-60 truncate">By {creator}</p>
          ) : null}
          {showTags && tags.length > 0 && !locked ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => {
                const chip = getTagChipStyles(t.name);
                return (
                  <span
                    key={t.id}
                    className="badge badge-sm font-normal"
                    style={chip.style}
                  >
                    {t.name}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </button>
    </div>
  );
}

export type FolderMenuAction =
  | "rename"
  | "move"
  | "set_passcode"
  | "clear_passcode"
  | "delete";

type FolderTileProps = {
  name: string;
  color: string;
  locked?: boolean;
  canEdit?: boolean;
  onOpen: () => void;
  onMenuAction?: (action: FolderMenuAction) => void;
};

export function FolderTile({
  name,
  color,
  locked = false,
  canEdit = false,
  onOpen,
  onMenuAction,
}: FolderTileProps) {
  return (
    <div className="group relative flex items-center gap-2 w-full h-10 px-2 hover:bg-base-200 transition-colors">
      <button
        type="button"
        onDoubleClick={onOpen}
        onClick={onOpen}
        className="flex items-center gap-2 flex-1 min-w-0 text-left h-full"
        aria-label={`Open folder ${name}`}
      >
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white"
          style={{ backgroundColor: color }}
        >
          <IconFolderFilled size={18} />
        </span>
        <span className="type-label truncate flex-1 min-w-0" title={name}>
          {name}
        </span>
        {locked ? (
          <IconLock size={14} className="opacity-50 shrink-0" />
        ) : null}
      </button>
      {canEdit && onMenuAction ? (
        <details className="dropdown dropdown-bottom dropdown-end shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 open:!opacity-100 z-50">
          <summary
            className="btn btn-ghost btn-xs btn-square list-none"
            aria-label="Folder actions"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDots size={14} />
          </summary>
          <ul className="dropdown-content menu bg-base-100 z-[9999] w-48 p-2 shadow-lg border border-base-300 type-body">
            {(
              [
                { action: "rename" as const, label: "Rename" },
                { action: "move" as const, label: "Move to…" },
                {
                  action: "set_passcode" as const,
                  label: locked ? "Change passcode" : "Set passcode",
                },
                ...(locked
                  ? [
                      {
                        action: "clear_passcode" as const,
                        label: "Turn passcode off",
                      },
                    ]
                  : []),
                { action: "delete" as const, label: "Delete" },
              ] as { action: FolderMenuAction; label: string }[]
            ).map(({ action, label }) => (
              <li key={action}>
                <button
                  type="button"
                  className={action === "delete" ? "text-error" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    const root = (e.currentTarget as HTMLElement).closest(
                      "details",
                    ) as HTMLDetailsElement | null;
                    if (root) root.open = false;
                    onMenuAction(action);
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
