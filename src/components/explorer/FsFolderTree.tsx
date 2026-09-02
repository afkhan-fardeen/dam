"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import type { Folder } from "@/lib/types";

type Props = {
  folders: Folder[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  onPrefetch?: (folderId: string | null) => void;
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
    const kids = (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
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

function TreeRow({
  node,
  depth,
  isLast,
  ancestorContinues,
  currentFolderId,
  expanded,
  toggle,
  onNavigate,
  onPrefetch,
}: {
  node: Node;
  depth: number;
  isLast: boolean;
  ancestorContinues: boolean[];
  currentFolderId: string | null;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onNavigate: (id: string | null) => void;
  onPrefetch?: (id: string | null) => void;
}) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const active = currentFolderId === node.id;

  return (
    <div className="fs-tree-block">
      <button
        type="button"
        className={`xp-nav-item fs-tree-row${active ? " is-active" : ""}`}
        title={node.name}
        onMouseEnter={() => onPrefetch?.(node.id)}
        onClick={() => onNavigate(node.id)}
      >
        <span className="tree-guides" aria-hidden>
          {Array.from({ length: depth }, (_, i) => {
            const lastCol = i === depth - 1;
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
        {hasKids ? (
          <span
            className="fs-tree-chevron"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                toggle(node.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <IconChevronDown size={12} stroke={2} />
            ) : (
              <IconChevronRight size={12} stroke={2} />
            )}
          </span>
        ) : (
          <span className="fs-tree-chevron is-spacer" />
        )}
        <FolderGlyph size={14} />
        <span className="truncate">{node.name}</span>
      </button>
      {hasKids && open
        ? node.children.map((child, i) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              ancestorContinues={[...ancestorContinues, !isLast]}
              currentFolderId={currentFolderId}
              expanded={expanded}
              toggle={toggle}
              onNavigate={onNavigate}
              onPrefetch={onPrefetch}
            />
          ))
        : null}
    </div>
  );
}

export function FsFolderTree({
  folders,
  currentFolderId,
  onNavigate,
  onPrefetch,
}: Props) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const ancestors = useMemo(
    () => ancestorIdsTo(currentFolderId, folders),
    [currentFolderId, folders],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestors));

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestors) next.add(id);
      return next;
    });
  }, [ancestors]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (tree.length === 0) return null;

  return (
    <div className="fs-tree" aria-label="Folder tree">
      {tree.map((node, i) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          isLast={i === tree.length - 1}
          ancestorContinues={[]}
          currentFolderId={currentFolderId}
          expanded={expanded}
          toggle={toggle}
          onNavigate={onNavigate}
          onPrefetch={onPrefetch}
        />
      ))}
    </div>
  );
}
