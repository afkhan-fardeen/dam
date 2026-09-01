"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconClock,
  IconHome,
  IconKey,
  IconLogout,
  IconSettings,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDriveChrome } from "@/components/DriveChrome";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import { Menu } from "@/components/ui/Menu";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import type { ServerStatus } from "@/lib/useFileServerHealth";
import type { FsNode, Profile } from "@/lib/types";

const ADMIN_LINKS = [
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "groups", label: "Groups", href: "/admin/groups" },
  { id: "tags", label: "Tags", href: "/admin/tags" },
  { id: "activity", label: "Activity", href: "/admin/activity" },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  serverStatus: ServerStatus;
  showTrash: boolean;
  onOpenSettings: () => void;
  onSignOut: () => void;
  mode?: "employee" | "admin";
};

function serverDot(status: ServerStatus): { color: string; title: string } {
  switch (status) {
    case "connected":
      return { color: "var(--ok)", title: "File server online" };
    case "checking":
      return { color: "var(--ink-faint)", title: "Checking file server…" };
    default:
      return { color: "var(--danger)", title: "File server offline" };
  }
}

export function ExplorerNavPane({
  open,
  onClose,
  profile,
  serverStatus,
  showTrash,
  onOpenSettings,
  onSignOut,
  mode = "employee",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigate = useViewTransitionNavigate();
  const { libraryEpoch } = useDriveChrome();
  const server = serverDot(serverStatus);

  const view = searchParams.get("view") || "files";
  const folderParam = searchParams.get("folder");
  const onHome = pathname === "/";
  const onAdmin = pathname.startsWith("/admin");

  const [quickFolders, setQuickFolders] = useState<FsNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fs/browse?view=favorites");
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const nodes = (json.nodes as FsNode[]) ?? [];
        setQuickFolders(nodes.filter((n) => n.node_type === "folder"));
      } catch {
        if (!cancelled) setQuickFolders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryEpoch]);

  const initials = useMemo(() => {
    const name = profile.full_name || profile.email || "?";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile.full_name, profile.email]);

  function go(href: string) {
    navigate(href);
    onClose();
  }

  const rootActive =
    onHome &&
    (!view || view === "files" || view === "all") &&
    !folderParam;

  return (
    <>
      <button
        type="button"
        className={`xp-nav-scrim${open ? " is-open" : ""}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <nav
        className={`xp-nav${open ? " is-open" : ""}`}
        aria-label="Explorer navigation"
      >
        {mode === "admin" || onAdmin ? (
          <div className="xp-nav-section">
            <div className="xp-nav-label">Manage</div>
            {ADMIN_LINKS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`xp-nav-item${
                  pathname.startsWith(t.href) ? " is-active" : ""
                }`}
                onClick={() => go(t.href)}
              >
                <IconSettings size={14} stroke={1.75} />
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className="xp-nav-item"
              onClick={() => go("/")}
            >
              <IconHome size={14} stroke={1.75} />
              Back to files
            </button>
          </div>
        ) : (
          <>
            {quickFolders.length > 0 ? (
              <div className="xp-nav-section">
                <div className="xp-nav-label">Quick access</div>
                {quickFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`xp-nav-item${
                      folderParam === f.id ? " is-active" : ""
                    }`}
                    title={f.relative_path || f.name}
                    onClick={() =>
                      go(`/?folder=${encodeURIComponent(f.id)}`)
                    }
                  >
                    <FolderGlyph size={14} />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="xp-nav-section">
              <button
                type="button"
                className={`xp-nav-item${rootActive ? " is-active" : ""}`}
                onClick={() => go("/")}
              >
                <FolderGlyph size={14} />
                Main Drive
              </button>
              <button
                type="button"
                className={`xp-nav-item${
                  onHome && view === "recent" ? " is-active" : ""
                }`}
                onClick={() => go("/?view=recent")}
              >
                <IconClock size={14} stroke={1.75} />
                Recent
              </button>
              {showTrash ? (
                <button
                  type="button"
                  className={`xp-nav-item${
                    onHome && view === "trash" ? " is-active" : ""
                  }`}
                  onClick={() => go("/?view=trash")}
                >
                  <IconTrash size={14} stroke={1.75} />
                  Recycle Bin
                </button>
              ) : null}
            </div>
          </>
        )}

        <div className="xp-nav-footer">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: server.color }}
              title={server.title}
            />
            <span className="text-[11px] text-[var(--ink-soft)] truncate">
              {server.title}
            </span>
          </div>
          <Menu
            trigger={
              <button type="button" className="xp-nav-item">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-[10px] font-semibold">
                  {initials || <IconUser size={12} />}
                </span>
                <span className="truncate">
                  {profile.full_name?.trim() || profile.email || "Account"}
                </span>
              </button>
            }
          >
            {profile.is_admin ? (
              <button
                type="button"
                className="menu-row"
                onClick={() => go("/admin/users")}
              >
                <IconSettings size={15} /> Admin
              </button>
            ) : null}
            <button type="button" className="menu-row" onClick={onOpenSettings}>
              <IconKey size={15} /> Change password
            </button>
            <div className="card-divider" />
            <button
              type="button"
              className="menu-row menu-row-danger"
              onClick={onSignOut}
            >
              <IconLogout size={15} /> Sign out
            </button>
          </Menu>
        </div>
      </nav>
    </>
  );
}
