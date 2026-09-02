"use client";

import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconClock,
  IconHome,
  IconSettings,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDriveChrome } from "@/components/DriveChrome";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import { FsFolderTree } from "@/components/explorer/FsFolderTree";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import type { FsNode, Profile } from "@/lib/types";

const ADMIN_LINKS = [
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "groups", label: "Groups", href: "/admin/groups" },
  { id: "tags", label: "Tags", href: "/admin/tags" },
  { id: "activity", label: "Activity", href: "/admin/activity" },
] as const;

type ActivityEntry = {
  id: string;
  action: string;
  summary: string;
  created_at: string | null;
  is_error?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  showTrash: boolean;
  mode?: "employee" | "admin";
};

export function ExplorerNavPane({
  open,
  onClose,
  profile,
  showTrash,
  mode = "employee",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigate = useViewTransitionNavigate();
  const { libraryEpoch, placeNav } = useDriveChrome();
  void profile;

  const view = searchParams.get("view") || "files";
  const folderParam = searchParams.get("folder");
  const onHome = pathname === "/";
  const onAdmin = pathname.startsWith("/admin");

  const [quickFolders, setQuickFolders] = useState<FsNode[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const res = await fetch("/api/activity/feed?limit=16");
        const json = await res.json();
        if (!res.ok || cancelled) return;
        setActivity((json.entries as ActivityEntry[]) ?? []);
      } catch {
        if (!cancelled) setActivity([]);
      }
    }
    void loadActivity();
    const id = window.setInterval(() => void loadActivity(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [libraryEpoch]);

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
          <div className="xp-nav-scroll">
            <div className="xp-nav-section">
              <button
                type="button"
                className={`xp-nav-item${rootActive ? " is-active" : ""}`}
                onClick={() => go("/")}
              >
                <FolderGlyph size={14} />
                Main Drive
              </button>
              {placeNav && placeNav.folders.length > 0 ? (
                <FsFolderTree
                  folders={placeNav.folders}
                  currentFolderId={placeNav.currentFolderId}
                  onNavigate={(id) => {
                    placeNav.onNavigateFolder(id);
                    onClose();
                  }}
                  onPrefetch={placeNav.onPrefetchFolder}
                />
              ) : null}
            </div>

            <div className="xp-nav-section">
              <div className="xp-nav-label">Quick access</div>
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
              <button
                type="button"
                className={`xp-nav-item${
                  onHome && (view === "favorites" || view === "starred")
                    ? " is-active"
                    : ""
                }`}
                onClick={() => go("/?view=favorites")}
              >
                <IconStar size={14} stroke={1.75} />
                Favorites
              </button>
              {quickFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`xp-nav-item${
                    folderParam === f.id ? " is-active" : ""
                  }`}
                  title={f.relative_path || f.name}
                  onClick={() => go(`/?folder=${encodeURIComponent(f.id)}`)}
                >
                  <FolderGlyph size={14} />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>

            <div className="xp-nav-section xp-nav-activity">
              <div className="xp-nav-label">Logs &amp; Activities</div>
              {activity.length === 0 ? (
                <p className="xp-nav-activity-empty">No recent activity</p>
              ) : (
                <ul className="xp-nav-activity-list">
                  {activity.map((e) => (
                    <li
                      key={e.id}
                      className={`xp-nav-activity-item${
                        e.is_error ? " is-error" : ""
                      }`}
                      title={e.summary}
                    >
                      {e.is_error ? (
                        <IconAlertTriangle size={12} stroke={1.75} />
                      ) : null}
                      <span className="truncate">{e.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {showTrash && mode !== "admin" && !onAdmin ? (
          <div className="xp-nav-footer xp-nav-trash-pin">
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
          </div>
        ) : null}
      </nav>
    </>
  );
}
