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
import { Menu } from "@/components/ui/Menu";
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
  layout?: "grid" | "list" | "photos";
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
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Menu
        align="right"
        widthClass="w-[180px]"
        trigger={
          <span className="asset-card-icon-btn" aria-label="File actions">
            <IconDots size={14} stroke={1.75} />
          </span>
        }
      >
        <button
          type="button"
          className="menu-row"
          onClick={() => onMenuAction("rename")}
        >
          Rename
        </button>
        <button
          type="button"
          className="menu-row"
          onClick={() => onMenuAction("move")}
        >
          Move to folder
        </button>
        <div className="card-divider" />
        <button
          type="button"
          className="menu-row menu-row-danger"
          onClick={() => onMenuAction("trash")}
        >
          Move to trash
        </button>
      </Menu>
    </span>
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
          ? "absolute top-1 right-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          : ""
      }`}
    >
      {onToggleFavorite ? (
        <button
          type="button"
          className="asset-card-icon-btn"
          aria-label={asset.favorited ? "Unstar" : "Star"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {asset.favorited ? (
            <IconStarFilled size={14} className="text-[var(--warn)]" />
          ) : (
            <IconStar size={14} stroke={1.75} />
          )}
        </button>
      ) : null}
      {canDownload && onDownload ? (
        <button
          type="button"
          className="asset-card-icon-btn"
          aria-label="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <IconDownload size={14} stroke={1.75} />
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
        className={`asset-card-shell group flex items-center gap-3 px-3 py-2 ${
          selected ? "is-selected" : ""
        }`}
      >
        {selectionMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            className="asset-select-check shrink-0"
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
          <span className="shrink-0 w-8 h-8 bg-[var(--surface-2)] border border-[var(--line)] rounded-[var(--radius)] flex items-center justify-center overflow-hidden">
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
        <label className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            className="asset-select-check"
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
        className={`asset-card-shell flex flex-col items-stretch text-left focus:outline-none p-2 w-full ${
          selected ? "is-selected" : ""
        }`}
      >
        <div className="w-full aspect-[4/3] flex items-center justify-center bg-[var(--surface-2)] rounded-[var(--radius)] overflow-hidden relative border border-[var(--line)]">
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
    <div className="place-folder-tile group">
      <button
        type="button"
        onDoubleClick={onOpen}
        onClick={onOpen}
        className="place-folder-tile-main"
        aria-label={`Open folder ${name}`}
      >
        <span
          className="place-folder-tile-icon"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          <IconFolderFilled size={18} />
        </span>
        <span className="place-folder-tile-name truncate" title={name}>
          {name}
        </span>
        {locked ? (
          <IconLock size={14} className="place-folder-tile-lock" aria-hidden />
        ) : null}
      </button>
      {canEdit && onMenuAction ? (
        <span
          className="place-folder-tile-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <Menu
            align="right"
            widthClass="w-[190px]"
            trigger={
              <span className="asset-card-icon-btn" aria-label="Folder actions">
                <IconDots size={14} stroke={1.75} />
              </span>
            }
          >
            <button
              type="button"
              className="menu-row"
              onClick={() => onMenuAction("rename")}
            >
              Rename
            </button>
            <button
              type="button"
              className="menu-row"
              onClick={() => onMenuAction("move")}
            >
              Move to…
            </button>
            <button
              type="button"
              className="menu-row"
              onClick={() => onMenuAction("set_passcode")}
            >
              {locked ? "Change passcode" : "Set passcode"}
            </button>
            {locked ? (
              <button
                type="button"
                className="menu-row"
                onClick={() => onMenuAction("clear_passcode")}
              >
                Turn passcode off
              </button>
            ) : null}
            <div className="card-divider" />
            <button
              type="button"
              className="menu-row menu-row-danger"
              onClick={() => onMenuAction("delete")}
            >
              Delete folder
            </button>
          </Menu>
        </span>
      ) : null}
    </div>
  );
}
