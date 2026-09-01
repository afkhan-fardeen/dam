"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconFile,
  IconSearch,
  IconSettings,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import { entityTypeColor } from "@/components/EntityChip";
import type { Asset, Entity, FsNode, Space } from "@/lib/types";

type CommandBarProps = {
  spaces: Space[];
  isAdmin: boolean;
  canUpload: boolean;
  onUpload: () => void;
};

type ResultItem =
  | { kind: "action"; id: string; label: string; run: () => void }
  | { kind: "entity"; id: string; entity: Entity }
  | { kind: "document"; id: string; asset: Asset };

function fsNodeToAsset(node: FsNode): Asset {
  return {
    id: node.id,
    file_id: node.id,
    original_name: node.name,
    mime_type: node.mime_type,
    size: node.size_bytes,
    space_id: null,
    folder_id: node.parent_id,
    description: node.description,
    created_by: node.created_by,
    uploaded_by: node.uploaded_by,
    has_thumbnail: node.has_thumbnail,
    status: node.is_deleted ? "trashed" : "active",
    created_at: node.created_at,
    tags_text: node.tags_text,
    tags: node.tags,
    favorited: node.favorited,
  };
}

const SEARCH_DEBOUNCE_MS = 180; // match DriveShell navbar live search

export function CommandBar({
  spaces,
  isAdmin,
  canUpload,
  onUpload,
}: CommandBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [documents, setDocuments] = useState<Asset[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActive(0);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setEntities([]);
      setDocuments([]);
      return;
    }
    try {
      const [entityRes, fsRes] = await Promise.all([
        fetch(`/api/entities?q=${encodeURIComponent(q.trim())}&limit=6`).catch(
          () => null,
        ),
        fetch(`/api/fs/search?q=${encodeURIComponent(q.trim())}`),
      ]);
      if (entityRes?.ok) {
        const ej = await entityRes.json();
        setEntities((ej.entities ?? []) as Entity[]);
      } else {
        setEntities([]);
      }
      if (fsRes.ok) {
        const fj = await fsRes.json();
        const nodes = ((fj.nodes as FsNode[]) ?? []).filter(
          (n) => n.node_type === "file",
        );
        setDocuments(nodes.map(fsNodeToAsset));
      } else {
        setDocuments([]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(
      () => void search(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [query, search]);

  const actions = useMemo(() => {
    const list: ResultItem[] = [];
    if (canUpload) {
      list.push({
        kind: "action",
        id: "upload",
        label: "Upload file",
        run: () => {
          setOpen(false);
          onUpload();
        },
      });
    }
    if (isAdmin) {
      list.push({
        kind: "action",
        id: "admin",
        label: "Go to Admin",
        run: () => {
          setOpen(false);
          router.push("/admin/spaces");
        },
      });
    }
    list.push({
      kind: "action",
      id: "home",
      label: "Go to home",
      run: () => {
        setOpen(false);
        router.push("/");
      },
    });
    return list;
  }, [canUpload, isAdmin, onUpload, router]);

  /** Sections: Entities → Files → Actions (spaces omitted from user chrome). */
  const sections = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return [{ label: "Actions", items: actions }];
    }

    const entityItems: ResultItem[] = entities
      .slice(0, 6)
      .map((e) => ({ kind: "entity" as const, id: `e-${e.id}`, entity: e }));
    const docItems: ResultItem[] = documents
      .slice(0, 8)
      .map((a) => ({ kind: "document" as const, id: `d-${a.id}`, asset: a }));
    const actionItems = actions.filter(
      (a) =>
        a.kind === "action" &&
        a.label.toLowerCase().includes(q.toLowerCase()),
    );

    return [
      { label: "Entities", items: entityItems },
      { label: "Files", items: docItems },
      { label: "Actions", items: actionItems },
    ].filter((s) => s.items.length > 0);
  }, [query, entities, documents, actions]);

  const flatItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections],
  );

  useEffect(() => {
    setActive(0);
  }, [flatItems.length, query]);

  function runItem(item: ResultItem) {
    if (item.kind === "action") item.run();
    else if (item.kind === "entity") {
      setOpen(false);
      router.push(`/e/${item.entity.id}`);
    } else if (item.kind === "document") {
      setOpen(false);
      const params = new URLSearchParams();
      if (item.asset.folder_id) params.set("folder", item.asset.folder_id);
      router.push(`/?${params.toString()}`);
    }
  }

  if (!open) return null;

  let flatIndex = -1;

  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        setOpen(false);
      }}
    >
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <div
        className="modal-box max-w-lg p-0 glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
        style={{ borderRadius: 22 }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <IconSearch size={16} className="text-[var(--ink-faint)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents and entities…"
            className="glass-input flex-1 type-body"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) =>
                  Math.min(i + 1, Math.max(flatItems.length - 1, 0)),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flatItems[active]) {
                e.preventDefault();
                runItem(flatItems[active]);
              }
            }}
          />
          <span className="type-caption shrink-0">esc</span>
        </div>
        <div className="glass-line mx-3" />

        <div className="max-h-80 overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <p className="px-4 py-6 type-body text-[var(--ink-soft)]">
              {query.trim()
                ? "Nothing matched. Try another name or invoice number."
                : "Type to search, or pick an action below."}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.label} className="mb-2">
                <p className="card-label px-3 py-1">{section.label}</p>
                <ul>
                  {section.items.map((item) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`menu-row ${
                            idx === active ? "!bg-white/55" : ""
                          }`}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => runItem(item)}
                        >
                          {item.kind === "action" ? (
                            <>
                              {item.id === "upload" ? (
                                <IconUpload
                                  size={14}
                                  className="text-[var(--ink-faint)]"
                                />
                              ) : item.id === "admin" ? (
                                <IconUsers
                                  size={14}
                                  className="text-[var(--ink-faint)]"
                                />
                              ) : (
                                <IconSettings
                                  size={14}
                                  className="text-[var(--ink-faint)]"
                                />
                              )}
                              <span className="type-label">{item.label}</span>
                            </>
                          ) : null}
                          {item.kind === "entity" ? (
                            <>
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: entityTypeColor(
                                    item.entity.entity_type?.name,
                                  ),
                                }}
                              />
                              <span className="truncate flex-1">
                                {item.entity.name}
                              </span>
                              <span className="type-caption">
                                {item.entity.entity_type?.label || "Entity"}
                              </span>
                            </>
                          ) : null}
                          {item.kind === "document" ? (
                            <>
                              <IconFile
                                size={14}
                                className="text-[var(--ink-faint)]"
                              />
                              <span className="truncate">
                                {item.asset.original_name || "Untitled"}
                              </span>
                            </>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 type-caption flex gap-3">
          <span>↑↓</span>
          <span>↵ open</span>
          <span>⌘K</span>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" onClick={() => setOpen(false)}>
          close
        </button>
      </form>
    </dialog>
  );
}
