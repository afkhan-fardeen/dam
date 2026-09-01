"use client";

import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconHome,
  IconKey,
  IconLogout,
  IconSettings,
  IconStar,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDriveChrome } from "@/components/DriveChrome";
import { FolderTree } from "@/components/FolderTree";
import { Menu } from "@/components/ui/Menu";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import { prefetchFolderAssets } from "@/lib/folderAssetsCache";
import type { ServerStatus } from "@/lib/useFileServerHealth";
import type { Folder, Profile, Space } from "@/lib/types";

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
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  profile: Profile;
  serverStatus: ServerStatus;
  onOpenSettings: () => void;
  onSignOut: () => void;
};

function serverCopy(status: ServerStatus): {
  label: string;
  color: string;
  title: string;
} {
  switch (status) {
    case "connected":
      return {
        label: "Server online",
        color: "var(--ok)",
        title: "File server is online",
      };
    case "checking":
      return {
        label: "Checking server…",
        color: "var(--ink-faint)",
        title: "Checking file server…",
      };
    default:
      return {
        label: "Server offline",
        color: "var(--danger)",
        title: "File server unavailable — uploads and previews may fail",
      };
  }
}

export function AppSidebar({
  spaces,
  showTrash = false,
  open,
  onClose,
  mode = "employee",
  collapsed = false,
  onToggleCollapsed,
  profile,
  serverStatus,
  onOpenSettings,
  onSignOut,
}: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigate = useViewTransitionNavigate();
  const { placeNav, libraryEpoch } = useDriveChrome();
  const server = serverCopy(serverStatus);

  const initials = useMemo(() => {
    const name = profile.full_name || profile.email || "?";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile.full_name, profile.email]);

  const displayName = profile.full_name?.trim() || profile.email || "Account";

  const view = searchParams.get("view") || "all";
  const onHome = pathname === "/";
  const activeSlug = pathname.startsWith("/s/")
    ? pathname.split("/")[2]
    : null;

  const [foldersBySpaceId, setFoldersBySpaceId] = useState<
    Record<string, Folder[]>
  >({});
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        spaces.map(async (s) => {
          try {
            const res = await fetch(
              `/api/fs/list?space_id=${encodeURIComponent(s.id)}&folders=1`,
            );
            const json = await res.json();
            const nodes = res.ok
              ? ((json.nodes as {
                  id: string;
                  space_id: string;
                  parent_id: string | null;
                  name: string;
                  created_by: string | null;
                  created_at: string | null;
                  passcode_enabled?: boolean;
                }[]) ?? [])
              : [];
            const ids = new Set(nodes.map((n) => n.id));
            const folders: Folder[] = nodes.map((n) => ({
              id: n.id,
              space_id: n.space_id,
              parent_folder_id:
                n.parent_id && ids.has(n.parent_id) ? n.parent_id : null,
              name: n.name,
              created_by: n.created_by,
              created_at: n.created_at,
              passcode_enabled: n.passcode_enabled,
            }));
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
        className={`app-sidebar${open ? " is-open" : ""}${
          collapsed ? " is-collapsed" : ""
        }`}
        aria-label={mode === "admin" ? "Admin" : "Spaces"}
      >
        <div className="app-sidebar-brand">
          <Link
            href="/"
            className="app-sidebar-logo"
            onClick={onClose}
            title="Asset Hub"
          >
            <span className="app-sidebar-logo-mark" aria-hidden />
            <span className="app-sidebar-logo-text">Asset Hub</span>
          </Link>
          <div className="app-sidebar-brand-actions">
            {onToggleCollapsed ? (
              <button
                type="button"
                className="app-sidebar-collapse"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand" : "Collapse"}
                onClick={onToggleCollapsed}
              >
                {collapsed ? (
                  <IconChevronRight size={16} stroke={1.75} />
                ) : (
                  <IconChevronLeft size={16} stroke={1.75} />
                )}
              </button>
            ) : null}
            <button
              type="button"
              className="app-sidebar-close"
              aria-label="Close"
              onClick={onClose}
            >
              <IconX size={18} stroke={1.75} />
            </button>
          </div>
        </div>

        <nav className="app-sidebar-nav">
          {mode === "admin" ? (
            <div className="app-sidebar-section">
              {!collapsed ? (
                <div className="app-sidebar-label">Manage</div>
              ) : null}
              {ADMIN_LINKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`app-sidebar-link${
                    pathname.startsWith(t.href) ? " active" : ""
                  }`}
                  title={t.label}
                  onClick={() => go(t.href)}
                >
                  <span className="app-sidebar-link-text">{t.label}</span>
                </button>
              ))}
              <button
                type="button"
                className="app-sidebar-link"
                title="Back to app"
                onClick={() => go("/")}
              >
                <IconHome size={16} stroke={1.75} />
                <span className="app-sidebar-link-text">Back to app</span>
              </button>
            </div>
          ) : (
            <>
              <div className="app-sidebar-section">
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "all" ? " active" : ""}`}
                  title="Home"
                  onClick={() => go("/")}
                >
                  <IconHome size={16} stroke={1.75} />
                  <span className="app-sidebar-link-text">Home</span>
                </button>
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "recent" ? " active" : ""}`}
                  title="Recents"
                  onClick={() => go("/?view=recent")}
                >
                  <IconClock size={16} stroke={1.75} />
                  <span className="app-sidebar-link-text">Recents</span>
                </button>
                <button
                  type="button"
                  className={`app-sidebar-link${onHome && view === "favorites" ? " active" : ""}`}
                  title="Favorites"
                  onClick={() => go("/?view=favorites")}
                >
                  <IconStar size={16} stroke={1.75} />
                  <span className="app-sidebar-link-text">Favorites</span>
                </button>
                {showTrash ? (
                  <button
                    type="button"
                    className={`app-sidebar-link${onHome && view === "trash" ? " active" : ""}`}
                    title="Trash"
                    onClick={() => go("/?view=trash")}
                  >
                    <IconTrash size={16} stroke={1.75} />
                    <span className="app-sidebar-link-text">Trash</span>
                  </button>
                ) : null}
              </div>

              <div className="app-sidebar-section">
                {!collapsed ? (
                  <div className="app-sidebar-label">Spaces</div>
                ) : null}
                {spaces.length === 0 ? (
                  !collapsed ? (
                    <p className="app-sidebar-empty">No spaces yet</p>
                  ) : null
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
                      const showTree =
                        !collapsed && isExpanded && hasFolders;

                      return (
                        <li
                          key={s.id}
                          className={`app-sidebar-place-block${active ? " is-active" : ""}`}
                        >
                          <div className="app-sidebar-place-row">
                            {!collapsed && hasFolders ? (
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
                            ) : !collapsed ? (
                              <span className="app-sidebar-place-chevron is-empty" />
                            ) : null}
                            <button
                              type="button"
                              className={`app-sidebar-place${active ? " active" : ""}`}
                              title={s.name}
                              onClick={() => {
                                if (
                                  !collapsed &&
                                  !isExpanded &&
                                  hasFolders
                                ) {
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
                              <span className="app-sidebar-link-text truncate">
                                {s.name}
                              </span>
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

        <div className="app-sidebar-footer">
          <div className="app-sidebar-server" title={server.title}>
            <span
              className="app-sidebar-server-dot"
              style={{ backgroundColor: server.color }}
              aria-hidden
            />
            <span className="app-sidebar-server-label">{server.label}</span>
          </div>

          <div className="app-sidebar-account">
            <Menu
              align="left"
              side="top"
              widthClass="w-[200px]"
              className="app-sidebar-account-menu"
              trigger={
                <span
                  className="app-sidebar-account-trigger"
                  title={displayName}
                >
                  <span className="app-sidebar-avatar" aria-hidden>
                    {initials || <IconUser size={14} />}
                  </span>
                  <span className="app-sidebar-account-meta">
                    <span className="app-sidebar-account-name truncate">
                      {displayName}
                    </span>
                    {profile.email && profile.full_name?.trim() ? (
                      <span className="app-sidebar-account-email truncate">
                        {profile.email}
                      </span>
                    ) : null}
                  </span>
                </span>
              }
            >
              {profile.is_admin ? (
                <Link
                  href="/admin/spaces"
                  className="menu-row"
                  onClick={onClose}
                >
                  <IconSettings size={15} /> Admin
                </Link>
              ) : null}
              <button
                type="button"
                className="menu-row"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
              >
                <IconKey size={15} /> Settings
              </button>
              <div className="card-divider" />
              <button
                type="button"
                className="menu-row menu-row-danger"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
              >
                <IconLogout size={15} /> Sign out
              </button>
            </Menu>
          </div>
        </div>
      </aside>
    </>
  );
}
