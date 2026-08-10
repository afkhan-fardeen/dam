"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight, IconFolder } from "@tabler/icons-react";
import type { Folder } from "@/lib/types";

type FolderTreeProps = {
  folders: Folder[];
  spaceName: string;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  /** Warm folder listing cache on hover */
  onPrefetch?: (folderId: string | null) => void;
  /** panel = sticky aside; embedded = fills parent (app sidebar) */
  variant?: "panel" | "embedded";
  /** When false, skip the place/root row (parent already renders it) */
  showRoot?: boolean;
  /** Extra indent depth for guide lines when nested under a place */
  baseDepth?: number;
};

type Node = Folder & { children: Node[] };

function buildTree(folders: Folder[]): Node[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parent_folder_id ?? null;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  function walk(parentId: string | null): Node[] {
    const kids = (byParent.get(parentId) ?? []).slice().sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return kids.map((f) => ({ ...f, children: walk(f.id) }));
  }
  return walk(null);
}

function ancestorIdsTo(folderId: string | null, folders: Folder[]): string[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ids: string[] = [];
  let cur = byId.get(folderId);
  while (cur) {
    ids.push(cur.id);
    cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
  }
  return ids;
}

function TreeGuides({
  depth,
  isLast,
  ancestorContinues,
}: {
  depth: number;
  isLast: boolean;
  ancestorContinues: boolean[];
}) {
  if (depth <= 0) return null;
  return (
    <span className="tree-guides" aria-hidden>
      {Array.from({ length: depth }, (_, i) => {
        const lastCol = i === depth - 1;
        // Vertical stem through this column (siblings below, or ancestor still open)
        const stem = lastCol ? !isLast : Boolean(ancestorContinues[i]);
        return (
          <span
            key={i}
            className={[
              "tree-guide-col",
              lastCol ? "is-elbow" : "",
              stem ? "is-stem" : "",
              lastCol && isLast ? "is-end" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        );
      })}
    </span>
  );
}

function TreeNode({
  node,
  depth,
  isLast,
  ancestorContinues,
  currentFolderId,
  onNavigate,
  onPrefetch,
  expanded,
  toggle,
  showGuides,
}: {
  node: Node;
  depth: number;
  isLast: boolean;
  ancestorContinues: boolean[];
  currentFolderId: string | null;
  onNavigate: (id: string | null) => void;
  onPrefetch?: (id: string | null) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  showGuides: boolean;
}) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const active = currentFolderId === node.id;

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-row ${active ? "active" : ""}`}
        onClick={() => onNavigate(node.id)}
        onMouseEnter={() => onPrefetch?.(node.id)}
        onFocus={() => onPrefetch?.(node.id)}
      >
        {showGuides ? (
          <TreeGuides
            depth={depth}
            isLast={isLast}
            ancestorContinues={ancestorContinues}
          />
        ) : null}
        <span
          className="tree-chevron"
          onClick={(e) => {
            if (!hasKids) return;
            e.stopPropagation();
            toggle(node.id);
          }}
        >
          {hasKids ? (
            open ? (
              <IconChevronDown size={14} stroke={1.75} />
            ) : (
              <IconChevronRight size={14} stroke={1.75} />
            )
          ) : (
            <span className="tree-chevron-spacer" />
          )}
        </span>
        <IconFolder size={14} className="tree-folder-icon shrink-0" />
        <span className="tree-folder-name truncate">{node.name}</span>
      </button>
      {hasKids && open
        ? node.children.map((c, i) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              ancestorContinues={[...ancestorContinues, !isLast]}
              currentFolderId={currentFolderId}
              onNavigate={onNavigate}
              onPrefetch={onPrefetch}
              expanded={expanded}
              toggle={toggle}
              showGuides={showGuides}
            />
          ))
        : null}
    </div>
  );
}

export function FolderTree({
  folders,
  spaceName,
  currentFolderId,
  onNavigate,
  onPrefetch,
  variant = "panel",
  showRoot = true,
  baseDepth = 0,
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const showGuides = true;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const chain = ancestorIdsTo(currentFolderId, folders);
    if (chain.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of chain) {
        if (id !== currentFolderId) next.add(id);
      }
      return next;
    });
  }, [currentFolderId, folders]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const body = (
    <>
      {showRoot ? (
        <button
          type="button"
          className={`tree-row ${currentFolderId == null ? "active" : ""}`}
          onClick={() => onNavigate(null)}
          onMouseEnter={() => onPrefetch?.(null)}
          onFocus={() => onPrefetch?.(null)}
        >
          <span className="tree-chevron">
            <span className="tree-chevron-spacer" />
          </span>
          <IconFolder size={14} className="tree-folder-icon text-[var(--accent)]" />
          <span className="tree-folder-name truncate font-medium">{spaceName}</span>
        </button>
      ) : null}
      {tree.map((n, i) => (
        <TreeNode
          key={n.id}
          node={n}
          depth={baseDepth + (showRoot ? 1 : 0)}
          isLast={i === tree.length - 1}
          ancestorContinues={
            showRoot || baseDepth > 0
              ? Array.from(
                  { length: Math.max(0, baseDepth + (showRoot ? 1 : 0) - 1) },
                  () => true,
                )
              : []
          }
          currentFolderId={currentFolderId}
          onNavigate={onNavigate}
          onPrefetch={onPrefetch}
          expanded={expanded}
          toggle={toggle}
          showGuides={showGuides}
        />
      ))}
    </>
  );

  if (variant === "embedded") {
    return <div className="folder-tree-embedded">{body}</div>;
  }

  return (
    <aside className="tree-panel hidden md:flex flex-col w-[220px] shrink-0 max-h-[calc(100vh-var(--bar-h)-2rem)] sticky top-2 overflow-y-auto">
      {body}
    </aside>
  );
}
