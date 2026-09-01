"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { FsNode } from "@/lib/types";
import { readViewMode, writeViewMode, type ViewMode } from "@/lib/uiPrefs";
import { getTagChipStyles } from "@/lib/categories";

type Props = {
  isAdmin: boolean;
};

export function FsBrowseClient({ isAdmin }: Props) {
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

  async function toggleFavorite(node: FsNode) {
    const favorited = Boolean(node.favorited);
    try {
      if (favorited) {
        await fetch(
          `/api/fs/favorites?fs_node_id=${encodeURIComponent(node.id)}`,
          { method: "DELETE" },
        );
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
      const res = await fetch(
        `/api/fs/nodes/${trashTarget.id}${permanent ? "?permanent=1" : ""}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Delete failed");
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
            {loading
              ? "Loading…"
              : `${nodes.length} item${nodes.length === 1 ? "" : "s"}`}
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
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {nodes.map((node) => {
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
                    if (node.node_type === "folder") {
                      router.push(`/?folder=${encodeURIComponent(node.id)}`);
                    } else if (node.parent_id) {
                      router.push(
                        `/?folder=${encodeURIComponent(node.parent_id)}`,
                      );
                    } else {
                      router.push("/");
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
                        <IconFolder size={36} className="text-[#A7C3FA]" />
                      </div>
                    )}
                  </div>
                  <div className="truncate p-2 text-sm font-medium">
                    {node.name}
                  </div>
                  {node.tags?.length ? (
                    <div className="flex flex-wrap gap-1 px-2 pb-2">
                      {node.tags.slice(0, 2).map((t) => (
                        <span
                          key={t.id}
                          className="badge badge-ghost badge-xs"
                          style={getTagChipStyles(t.name).style}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
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
                  {node.node_type === "file" && view !== "trash" ? (
                    <button
                      type="button"
                      className="btn btn-circle btn-xs"
                      onClick={() => downloadNode(node)}
                    >
                      <IconDownload size={12} />
                    </button>
                  ) : null}
                  {isAdmin || view === "trash" ? (
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
          title={view === "trash" ? "Delete permanently?" : "Move to trash?"}
          message={
            view === "trash"
              ? `Permanently delete “${trashTarget.name}”.`
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
