"use client";

import {
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconHome,
  IconStar,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDriveChrome } from "@/components/DriveChrome";
import { FolderTree } from "@/components/FolderTree";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import { prefetchFolderAssets } from "@/lib/folderAssetsCache";
import type { Folder, Space } from "@/lib/types";

const ADMIN_LINKS = [
  { id: "spaces", label: "Spaces", href: "/admin/spaces" },
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "tags", label: "Tags", href: "/admin/tags" },
  { id: "entities", label: "Entities", href: "/admin/entities" },
  { id: "attributes", label: "Attributes", href: "/admin/attributes" },
  { id: "activity", label: "Activity", href: "/admin/activity" },
] as const;

type AppSidebarProps = {
  spaces: Space[];
  showTrash?: boolean;
  open: boolean;
  onClose: () => void;
  mode?: "employee" | "admin";
};

export function AppSidebar({
  spaces,
  showTrash = false,
  open,
  onClose,
  mode = "employee",
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigate = useViewTransitionNavigate();
  const { placeNav, libraryEpoch } = useDriveChrome();

  const view = searchParams.get("view") || "all";
  const onHome = pathname === "/";
  const activeSlug = pathname.startsWith("/s/")
    ? pathname.split("/")[2]
    : null;

  const [foldersBySpaceId, setFoldersBySpaceId] = useState<
    Record<string, Folder[]>
  >({});
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        spaces.map(async (s) => {
          try {
            const res = await fetch(`/api/folders?space_id=${s.id}`);
            const json = await res.json();
            const folders = res.ok ? ((json.folders as Folder[]) ?? []) : [];
            return [s.id, folders] as const;
          } catch {
            return [s.id, [] as Folder[]] as const;
          }
        }),
      );
      if (!cancelled) setFoldersBySpaceId(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [spaces, libraryEpoch]);

  useEffect(() => {
    if (!activeSlug) return;
    setExpandedSlugs((prev) => {
      if (prev.has(activeSlug)) return prev;
      const next = new Set(prev);
      next.add(activeSlug);
      return next;
    });
  }, [activeSlug]);

  // Keep active place folders fresh from workspace
  useEffect(() => {
    if (!placeNav) return;
    const space = spaces.find((s) => s.slug === placeNav.spaceSlug);
    if (!space) return;
    setFoldersBySpaceId((prev) => ({
      ...prev,
      [space.id]: placeNav.folders,
    }));
  }, [placeNav, spaces]);

  const rootFolderCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of spaces) {
      const folders = foldersBySpaceId[s.id] ?? [];
      map.set(
        s.id,
        folders.filter((f) => f.parent_folder_id == null).length,
      );
    }
    return map;
  }, [spaces, foldersBySpaceId]);

  function go(href: string) {
    navigate(href);
    onClose();
  }

  function toggleExpanded(slug: string) {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        className={`app-sidebar-scrim${open ? " is-open" : ""}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside
        className={`app-sidebar${open ? " is-open" : ""}`}
        aria-label={mode === "admin" ? "Admin" : "Places"}
      >
        <div className="app-sidebar-header">
          <span className="app-sidebar-title">
            {mode === "admin" ? "Admin" : "Navigate"}
          </span>
          <button
            type="button"
            className="app-sidebar-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconX size={18} stroke={1.75} />
          </button>
        </div>

        <nav className="app-sidebar-nav">
          {mode === "admin" ? (
            <div className="app-sidebar-section">
              <div className="app-sidebar-label">Manage</div>
              {ADMIN_LINKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`app-sidebar-link${
                    pathname.startsWith(t.href) ? " active" : ""
                  }`}
                  onClick={() => go(t.href)}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                className="app-sidebar-link"
                onClick={() => go("/")}
              >
                <IconHome size={16} stroke={1.75} />
                Back to app
              </button>
            </div>
          ) : (
            <>
              <div className="app-sidebar-section">
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "all" ? " active" : ""}`}
                  onClick={() => go("/")}
                >
                  <IconHome size={16} stroke={1.75} />
                  Home
                </button>
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "recent" ? " active" : ""}`}
                  onClick={() => go("/?view=recent")}
                >
                  <IconClock size={16} stroke={1.75} />
                  Recents
                </button>
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "favorites" ? " active" : ""}`}
                  onClick={() => go("/?view=favorites")}
                >
                  <IconStar size={16} stroke={1.75} />
                  Favorites
                </button>
                {showTrash ? (
                  <button
                    type="button"
                    className={`app-sidebar-link${onHome && view === "trash" ? " active" : ""}`}
                    onClick={() => go("/?view=trash")}
                  >
                    <IconTrash size={16} stroke={1.75} />
                    Trash
                  </button>
                ) : null}
              </div>

              <div className="app-sidebar-section">
                <div className="app-sidebar-label">Places</div>
                {spaces.length === 0 ? (
                  <p className="app-sidebar-empty">No places yet</p>
                ) : (
                  <ul className="app-sidebar-places">
                    {spaces.map((s) => {
                      const active = activeSlug === s.slug;
                      const folders =
                        active && placeNav?.spaceSlug === s.slug
                          ? placeNav.folders
                          : (foldersBySpaceId[s.id] ?? []);
                      const hasFolders =
                        (rootFolderCount.get(s.id) ?? 0) > 0 ||
                        folders.some((f) => f.parent_folder_id == null);
                      const isExpanded = expandedSlugs.has(s.slug);
                      const showTree = isExpanded && hasFolders;

                      return (
                        <li
                          key={s.id}
                          className={`app-sidebar-place-block${active ? " is-active" : ""}`}
                        >
                          <div className="app-sidebar-place-row">
                            {hasFolders ? (
                              <button
                                type="button"
                                className="app-sidebar-place-chevron"
                                aria-label={
                                  isExpanded
                                    ? `Collapse ${s.name}`
                                    : `Expand ${s.name}`
                                }
                                aria-expanded={isExpanded}
                                onClick={() => toggleExpanded(s.slug)}
                              >
                                {isExpanded ? (
                                  <IconChevronDown size={14} stroke={1.75} />
                                ) : (
                                  <IconChevronRight size={14} stroke={1.75} />
                                )}
                              </button>
                            ) : (
                              <span className="app-sidebar-place-chevron is-empty" />
                            )}
                            <button
                              type="button"
                              className={`app-sidebar-place${active ? " active" : ""}`}
                              onClick={() => {
                                if (!isExpanded && hasFolders) {
                                  toggleExpanded(s.slug);
                                }
                                if (active && placeNav?.currentFolderId) {
                                  placeNav.onNavigateFolder(null);
                                  onClose();
                                  return;
                                }
                                go(`/s/${s.slug}`);
                              }}
                            >
                              <span
                                className="app-sidebar-dot"
                                style={{ backgroundColor: s.color }}
                                aria-hidden
                              />
                              <span className="truncate">{s.name}</span>
                            </button>
                          </div>
                          {showTree ? (
                            <div className="app-sidebar-place-tree">
                              <FolderTree
                                variant="embedded"
                                showRoot={false}
                                baseDepth={1}
                                folders={folders}
                                spaceName={s.name}
                                currentFolderId={
                                  active && placeNav
                                    ? placeNav.currentFolderId
                                    : null
                                }
                                onNavigate={(id) => {
                                  if (active && placeNav) {
                                    placeNav.onNavigateFolder(id);
                                  } else {
                                    const qs = id
                                      ? `?folder=${encodeURIComponent(id)}`
                                      : "";
                                    navigate(`/s/${s.slug}${qs}`);
                                  }
                                  onClose();
                                }}
                                onPrefetch={(id) => {
                                  if (active && placeNav?.onPrefetchFolder) {
                                    placeNav.onPrefetchFolder(id);
                                  } else {
                                    void prefetchFolderAssets(s.id, id);
                                  }
                                }}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
