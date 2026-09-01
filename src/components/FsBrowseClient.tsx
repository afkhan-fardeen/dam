"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconDownload,
  IconFolder,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { useDriveChrome } from "@/components/DriveChrome";
import { canDownload, canEdit, type FsNode, type Space, type SpaceMembership } from "@/lib/types";
import { roleForSpace } from "@/lib/auth-client";
import { readViewMode, writeViewMode, type ViewMode } from "@/lib/uiPrefs";
import { getTagChipStyles } from "@/lib/categories";

type Props = {
  spaces: Space[];
  memberships: SpaceMembership[];
  isAdmin: boolean;
};

export function FsBrowseClient({ spaces, memberships, isAdmin }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "all";
  const { upsertJob, removeJob, libraryEpoch, notifyLibraryChange } =
    useDriveChrome();

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [trashTarget, setTrashTarget] = useState<FsNode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );

  const title =
    view === "recent"
      ? "Recent"
      : view === "trash"
        ? "Trash"
        : view === "favorites" || view === "starred"
          ? "Favorites"
          : "All files";

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ view });
        const res = await fetch(`/api/fs/browse?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load files.");
        setNodes((json.nodes as FsNode[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load files.");
        setNodes([]);
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void load({ quiet: true });
  }, [libraryEpoch, load]);

  function roleForNode(node: FsNode) {
    return roleForSpace(memberships, node.space_id, isAdmin);
  }

  async function toggleFavorite(node: FsNode) {
    const favorited = Boolean(node.favorited);
    try {
      if (favorited) {
        await fetch(`/api/fs/favorites?fs_node_id=${encodeURIComponent(node.id)}`, {
          method: "DELETE",
        });
      } else {
        await fetch("/api/fs/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fs_node_id: node.id }),
        });
      }
      setNodes((prev) =>
        prev
          .map((n) =>
            n.id === node.id ? { ...n, favorited: !favorited } : n,
          )
          .filter((n) =>
            view === "starred" || view === "favorites" ? n.favorited : true,
          ),
      );
      notifyLibraryChange();
    } catch {
      /* ignore */
    }
  }

  function downloadNode(node: FsNode) {
    const jobId = `dl-${Date.now()}`;
    upsertJob({
      id: jobId,
      name: node.name,
      progress: 0,
      kind: "download",
      status: "downloading",
    });
    void fetch(`/api/fs/media/file/${node.id}?download=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = node.name;
        a.click();
        URL.revokeObjectURL(url);
        upsertJob({
          id: jobId,
          name: node.name,
          progress: 100,
          kind: "download",
          status: "done",
        });
        window.setTimeout(() => removeJob(jobId), 1500);
      })
      .catch((err) => {
        upsertJob({
          id: jobId,
          name: node.name,
          progress: 0,
          kind: "download",
          status: "error",
          error: err instanceof Error ? err.message : "Download failed",
        });
      });
  }

  async function confirmTrash() {
    if (!trashTarget) return;
    setBusy(true);
    const permanent = view === "trash";
    try {
      if (permanent) {
        const res = await fetch(
          `/api/fs/nodes/${trashTarget.id}?permanent=1`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Delete failed");
        }
      } else if (trashTarget.is_deleted) {
        const res = await fetch(`/api/fs/nodes/${trashTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restore: true }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Restore failed");
        }
      } else {
        const res = await fetch(`/api/fs/nodes/${trashTarget.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Trash failed");
        }
      }
      setTrashTarget(null);
      await load({ quiet: true });
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setTrashTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-base-content/60">
            {loading ? "Loading…" : `${nodes.length} item${nodes.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <ViewModeToggle
          value={viewMode}
          onChange={(mode) => {
            setViewMode(mode);
            writeViewMode(mode);
          }}
        />
      </div>

      {error ? (
        <div className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-base-content/60">Loading…</div>
      ) : nodes.length === 0 ? (
        <div className="rounded-box border border-base-300/60 bg-base-100 p-10 text-center text-sm text-base-content/60">
          {view === "trash" ? "Trash is empty." : "No files yet."}
        </div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto rounded-box border border-base-300/60">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Space</th>
                <th>Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const space = spaceById.get(node.space_id);
                const role = roleForNode(node);
                const editable = canEdit(role, isAdmin);
                const downloadable = canDownload(role, isAdmin);
                return (
                  <tr key={node.id} className="hover">
                    <td>
                      <button
                        type="button"
                        className="link link-hover font-medium"
                        onClick={() => {
                          if (node.node_type === "folder" && space) {
                            router.push(
                              `/s/${space.slug}?folder=${encodeURIComponent(node.id)}`,
                            );
                          } else if (space) {
                            router.push(
                              `/s/${space.slug}?folder=${encodeURIComponent(node.parent_id || "")}`,
                            );
                          }
                        }}
                      >
                        {node.node_type === "folder" ? (
                          <IconFolder size={16} className="mr-1 inline" />
                        ) : null}
                        {node.name}
                      </button>
                      {node.tags?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {node.tags.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="badge badge-ghost badge-sm"
                              style={getTagChipStyles(t.name).style}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>{space?.name ?? "—"}</td>
                    <td>
                      {node.size_bytes != null
                        ? `${(node.size_bytes / 1024).toFixed(0)} KB`
                        : "—"}
                    </td>
                    <td className="text-right">
                      <div className="join">
                        {node.node_type === "file" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item"
                            onClick={() => void toggleFavorite(node)}
                            title="Favorite"
                          >
                            {node.favorited ? (
                              <IconStarFilled size={14} />
                            ) : (
                              <IconStar size={14} />
                            )}
                          </button>
                        ) : null}
                        {downloadable && node.node_type === "file" && view !== "trash" ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item"
                            onClick={() => downloadNode(node)}
                          >
                            <IconDownload size={14} />
                          </button>
                        ) : null}
                        {editable ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item"
                            onClick={() => setTrashTarget(node)}
                          >
                            <IconTrash size={14} />
                          </button>
                        ) : null}
                        {view === "trash" && editable ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => {
                              void (async () => {
                                const res = await fetch(`/api/fs/nodes/${node.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ restore: true }),
                                });
                                if (res.ok) {
                                  await load({ quiet: true });
                                  notifyLibraryChange();
                                }
                              })();
                            }}
                          >
                            Restore
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {nodes.map((node) => {
            const space = spaceById.get(node.space_id);
            const role = roleForNode(node);
            const editable = canEdit(role, isAdmin);
            const downloadable = canDownload(role, isAdmin);
            const thumb =
              node.node_type === "file" && node.has_thumbnail
                ? `/api/fs/media/thumbnail/${node.id}`
                : null;
            return (
              <div
                key={node.id}
                className="group relative overflow-hidden rounded-box border border-base-300/60 bg-base-100"
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (!space) return;
                    if (node.node_type === "folder") {
                      router.push(
                        `/s/${space.slug}?folder=${encodeURIComponent(node.id)}`,
                      );
                    } else if (node.parent_id) {
                      router.push(
                        `/s/${space.slug}?folder=${encodeURIComponent(node.parent_id)}`,
                      );
                    } else {
                      router.push(`/s/${space.slug}`);
                    }
                  }}
                >
                  <div className="aspect-square bg-base-200">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-base-content/40">
                        <IconFolder size={36} />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-sm font-medium">{node.name}</div>
                    <div className="truncate text-xs text-base-content/50">
                      {space?.name}
                    </div>
                  </div>
                </button>
                <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                  {node.node_type === "file" ? (
                    <button
                      type="button"
                      className="btn btn-circle btn-xs"
                      onClick={() => void toggleFavorite(node)}
                    >
                      {node.favorited ? (
                        <IconStarFilled size={12} />
                      ) : (
                        <IconStar size={12} />
                      )}
                    </button>
                  ) : null}
                  {downloadable && node.node_type === "file" && view !== "trash" ? (
                    <button
                      type="button"
                      className="btn btn-circle btn-xs"
                      onClick={() => downloadNode(node)}
                    >
                      <IconDownload size={12} />
                    </button>
                  ) : null}
                  {editable ? (
                    <button
                      type="button"
                      className="btn btn-circle btn-xs"
                      onClick={() => setTrashTarget(node)}
                    >
                      <IconTrash size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {trashTarget ? (
        <ConfirmModal
          title={
            view === "trash" ? "Delete permanently?" : "Move to trash?"
          }
          message={
            view === "trash"
              ? `Permanently delete “${trashTarget.name}”. This cannot be undone.`
              : `Move “${trashTarget.name}” to trash.`
          }
          confirmLabel={view === "trash" ? "Delete permanently" : "Move to trash"}
          danger
          busy={busy}
          onClose={() => setTrashTarget(null)}
          onConfirm={() => void confirmTrash()}
        />
      ) : null}
    </div>
  );
}
