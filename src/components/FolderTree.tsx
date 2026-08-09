"use client";

import { useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight, IconFolder } from "@tabler/icons-react";
import type { Folder } from "@/lib/types";

type FolderTreeProps = {
  folders: Folder[];
  spaceName: string;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
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

function TreeNode({
  node,
  depth,
  currentFolderId,
  onNavigate,
  expanded,
  toggle,
}: {
  node: Node;
  depth: number;
  currentFolderId: string | null;
  onNavigate: (id: string | null) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const active = currentFolderId === node.id;

  return (
    <div>
      <button
        type="button"
        className={`tree-row ${active ? "active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onNavigate(node.id)}
      >
        <span
          className="w-4 shrink-0 inline-flex"
          onClick={(e) => {
            if (!hasKids) return;
            e.stopPropagation();
            toggle(node.id);
          }}
        >
          {hasKids ? (
            open ? (
              <IconChevronDown size={14} />
            ) : (
              <IconChevronRight size={14} />
            )
          ) : null}
        </span>
        <IconFolder size={14} className="text-[var(--ink-faint)] shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {hasKids && open
        ? node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              onNavigate={onNavigate}
              expanded={expanded}
              toggle={toggle}
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
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="tree-panel hidden md:flex flex-col w-[220px] shrink-0 max-h-[calc(100vh-var(--bar-h)-var(--dock-h)-2rem)] sticky top-2 overflow-y-auto">
      <button
        type="button"
        className={`tree-row ${currentFolderId == null ? "active" : ""}`}
        onClick={() => onNavigate(null)}
      >
        <span className="w-4" />
        <IconFolder size={14} className="text-[var(--accent)]" />
        <span className="truncate font-medium">{spaceName}</span>
      </button>
      {tree.map((n) => (
        <TreeNode
          key={n.id}
          node={n}
          depth={0}
          currentFolderId={currentFolderId}
          onNavigate={onNavigate}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </aside>
  );
}
