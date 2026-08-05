"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconClock,
  IconDots,
  IconFolder,
  IconKey,
  IconLock,
  IconLogout,
  IconSettings,
  IconStar,
  IconTrash,
  IconUpload,
  IconUser,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import {
  canEdit,
  type Space,
  type SpaceMembership,
  type SpaceRole,
  type Profile,
} from "@/lib/types";
import { roleForSpace } from "@/lib/auth-client";
import { useDriveChrome } from "@/components/DriveChrome";
import { useFileServerHealth } from "@/lib/useFileServerHealth";
import { UploadProgressPanel } from "@/components/UploadProgressPanel";
import { PasswordField } from "@/components/PasswordField";
import { CommandBar } from "@/components/CommandBar";
import { TopBar } from "@/components/glass/TopBar";
import { Dock, type DockItem } from "@/components/glass/Dock";
import { GlassDropdown } from "@/components/glass/GlassDropdown";
import { GlassButton } from "@/components/glass/GlassButton";
import { SearchHero } from "@/components/glass/SearchHero";
import { navigateWithTransition } from "@/components/glass/useViewTransitionNavigate";

type DriveShellProps = {
  spaces: Space[];
  memberships: SpaceMembership[];
  profile: Profile;
  viewingAs?: Profile | null;
  children: React.ReactNode;
};

export function DriveShell({
  spaces,
  memberships,
  profile,
  viewingAs = null,
  children,
}: DriveShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { requestUpload, requestNewFolder, serverOnline } = useDriveChrome();
  const health = useFileServerHealth();

  const activeSlug = pathname.startsWith("/s/")
    ? pathname.split("/")[2]
    : null;

  const activeSpace = spaces.find((s) => s.slug === activeSlug) ?? null;
  const role: SpaceRole | null = activeSpace
    ? roleForSpace(memberships, activeSpace.id, profile.is_admin)
    : profile.is_admin
      ? "editor"
      : null;
  const editable = canEdit(role, profile.is_admin);
  const view = searchParams.get("view") || "all";
  const onHome = pathname === "/";
  const onSearch = pathname === "/search";
  const onAdmin = pathname.startsWith("/admin");
  const onEntity = pathname.startsWith("/e/");
  const online = health === "connected" && serverOnline;
  const showHomeHero = onHome && view === "all";

  const showTrash =
    profile.is_admin || memberships.some((m) => m.role === "editor");

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  // Live search from slim top search (non-home pages)
  useEffect(() => {
    if (showHomeHero) return;
    const trimmed = query.trim();
    const urlQ = (searchParams.get("q") || "").trim();

    const handle = window.setTimeout(() => {
      if (!trimmed) {
        if (onSearch) navigateWithTransition(router, "/");
        return;
      }
      if (trimmed === urlQ && onSearch) return;
      navigateWithTransition(
        router,
        `/search?q=${encodeURIComponent(trimmed)}`,
      );
    }, 180);

    return () => window.clearTimeout(handle);
  }, [query, pathname, router, searchParams, showHomeHero, onSearch]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      navigateWithTransition(
        router,
        activeSlug ? `/s/${activeSlug}` : "/",
      );
      return;
    }
    navigateWithTransition(
      router,
      `/search?q=${encodeURIComponent(trimmed)}`,
    );
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg(error.message);
      return;
    }
    setPasswordMsg("Password updated.");
    setNewPassword("");
  }

  async function exitViewAs() {
    await fetch("/api/admin/view-as", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  const initials = useMemo(() => {
    const name = profile.full_name || profile.email || "?";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile]);

  const uploadDisabled = !online || view === "trash";
  const canUploadHere =
    editable && (Boolean(activeSlug) || onHome || onSearch) && !uploadDisabled;

  const dockItems: DockItem[] = useMemo(() => {
    if (onAdmin) {
      const tabs = [
        { id: "spaces", label: "Spaces", href: "/admin/spaces" },
        { id: "users", label: "Users", href: "/admin/users" },
        { id: "tags", label: "Tags", href: "/admin/tags" },
        { id: "entities", label: "Entities", href: "/admin/entities" },
        { id: "attributes", label: "Attributes", href: "/admin/attributes" },
        { id: "activity", label: "Activity", href: "/admin/activity" },
      ];
      return tabs.map((t) => ({
        ...t,
        primary: pathname.startsWith(t.href),
        active: pathname.startsWith(t.href),
      }));
    }

    if (onSearch) {
      return [
        {
          id: "upload",
          label: "Upload",
          icon: <IconUpload size={15} stroke={1.75} />,
          primary: true,
          disabled: !canUploadHere,
          onClick: () => {
            if (!activeSlug && spaces[0]) {
              navigateWithTransition(router, `/s/${spaces[0].slug}`);
              window.setTimeout(() => requestUpload(), 100);
            } else {
              requestUpload();
            }
          },
        },
        {
          id: "new-search",
          label: "New Search",
          onClick: () => {
            setQuery("");
            navigateWithTransition(router, "/");
          },
        },
        {
          id: "spaces",
          label: "Spaces",
          icon: <IconFolder size={15} stroke={1.75} />,
          href: spaces[0] ? `/s/${spaces[0].slug}` : "/",
        },
      ];
    }

    if (activeSlug) {
      const items: DockItem[] = [
        {
          id: "upload",
          label: "Upload",
          icon: <IconUpload size={15} stroke={1.75} />,
          primary: true,
          disabled: uploadDisabled || !editable,
          onClick: () => requestUpload(),
        },
        {
          id: "folder",
          label: "New folder",
          icon: <IconFolder size={15} stroke={1.75} />,
          disabled: !editable,
          onClick: () => requestNewFolder(),
        },
        {
          id: "home",
          label: "Home",
          href: "/",
        },
      ];
      if (showTrash) {
        items.push({
          id: "trash",
          label: "Trash",
          icon: <IconTrash size={15} stroke={1.75} />,
          href: `/?view=trash`,
          active: view === "trash",
        });
      }
      items.push({
        id: "settings",
        icon: <IconSettings size={15} stroke={1.75} />,
        title: "Settings",
        dividerBefore: true,
        onClick: () => {
          setPasswordOpen(true);
          setPasswordMsg(null);
        },
      });
      return items;
    }

    // Home / list views
    const homeItems: DockItem[] = [
      {
        id: "upload",
        label: "Upload",
        icon: <IconUpload size={15} stroke={1.75} />,
        primary: true,
        disabled: uploadDisabled,
        onClick: () => {
          if (spaces[0]) {
            navigateWithTransition(router, `/s/${spaces[0].slug}`);
            window.setTimeout(() => requestUpload(), 150);
          }
        },
        title: spaces[0] ? undefined : "No space to upload into",
      },
      {
        id: "favorites",
        label: "Favorites",
        icon: <IconStar size={15} stroke={1.75} />,
        href: "/?view=favorites",
        active: view === "favorites",
      },
      {
        id: "recent",
        label: "Recent",
        icon: <IconClock size={15} stroke={1.75} />,
        href: "/?view=recent",
        active: view === "recent",
      },
      {
        id: "spaces",
        label: "Spaces",
        icon: <IconFolder size={15} stroke={1.75} />,
        href: spaces[0] ? `/s/${spaces[0].slug}` : "/",
      },
      {
        id: "settings",
        icon: <IconSettings size={15} stroke={1.75} />,
        title: "Settings",
        dividerBefore: true,
        onClick: () => {
          setPasswordOpen(true);
          setPasswordMsg(null);
        },
      },
    ];
    return homeItems;
  }, [
    onAdmin,
    onSearch,
    activeSlug,
    pathname,
    canUploadHere,
    uploadDisabled,
    editable,
    spaces,
    showTrash,
    view,
    router,
    requestUpload,
    requestNewFolder,
  ]);

  const avatarTrigger = (
    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full glass text-[11px] font-semibold text-[var(--ink)]">
      {initials || <IconUser size={14} />}
    </span>
  );

  const moreMenu = (
    <span className="min-[1180px]:hidden">
      <GlassDropdown
        align="left"
        widthClass="w-[260px]"
        trigger={
          <span className="dock-btn !py-1.5 !px-2.5 ml-1" title="More">
            <IconDots size={16} stroke={1.75} />
          </span>
        }
      >
        <p className="card-label px-2.5 pt-1 pb-1">Spaces</p>
        {spaces.length === 0 ? (
          <p className="type-caption px-2.5 py-2">No spaces yet</p>
        ) : (
          spaces.map((space) => (
            <Link key={space.id} href={`/s/${space.slug}`} className="menu-row">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: space.color }}
              />
              <span className="truncate flex-1">{space.name}</span>
              {space.requires_passcode ? (
                <IconLock size={13} className="text-[var(--ink-faint)]" />
              ) : null}
            </Link>
          ))
        )}
        <div className="card-divider" />
        <Link href="/?view=favorites" className="menu-row">
          <IconStar size={14} /> Favorites
        </Link>
        <Link href="/?view=recent" className="menu-row">
          <IconClock size={14} /> Recent
        </Link>
        {showTrash ? (
          <Link href="/?view=trash" className="menu-row">
            <IconTrash size={14} /> Trash
          </Link>
        ) : null}
      </GlassDropdown>
    </span>
  );

  return (
    <div className="min-h-screen flex flex-col relative">
      {viewingAs ? (
        <div className="shrink-0 glass mx-3 mt-2 px-4 py-2 flex items-center justify-between gap-3 type-body">
          <span>
            Viewing as {viewingAs.full_name || viewingAs.email || "user"}
          </span>
          <GlassButton variant="glass" onClick={() => void exitViewAs()}>
            Exit
          </GlassButton>
        </div>
      ) : null}

      <TopBar
        more={showHomeHero || onHome ? moreMenu : undefined}
        serverStatus={health}
        trailing={
          <GlassDropdown trigger={avatarTrigger}>
            {profile.is_admin ? (
              <Link href="/admin/spaces" className="menu-row">
                <IconSettings size={15} /> Admin
              </Link>
            ) : null}
            <button
              type="button"
              className="menu-row"
              onClick={() => {
                setPasswordOpen(true);
                setPasswordMsg(null);
              }}
            >
              <IconKey size={15} /> Change password
            </button>
            <div className="card-divider" />
            <button
              type="button"
              className="menu-row menu-row-danger"
              onClick={() => void signOut()}
            >
              <IconLogout size={15} /> Sign out
            </button>
          </GlassDropdown>
        }
      />

      {!showHomeHero && !onEntity ? (
        <div className="px-4 sm:px-6 pb-3 max-w-3xl mx-auto w-full">
          {onSearch || (!onAdmin && !activeSlug) ? (
            <SearchHero
              value={query}
              onChange={setQuery}
              onSubmit={submitSearch}
              placeholder="Search…"
              showCmdK={onSearch}
              glow={onSearch}
              slim
            />
          ) : activeSlug ? (
            <div className="flex items-center gap-2 type-title">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: activeSpace?.color }}
              />
              {activeSpace?.name}
              {activeSpace?.requires_passcode ? (
                <IconLock size={14} className="text-[var(--ink-faint)]" />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <main
        className={`glass-content-root flex-1 min-w-0 ${
          showHomeHero ? "" : "overflow-auto pb-28 px-4 sm:px-6"
        }`}
      >
        {children}
      </main>

      {!onEntity ? <Dock items={dockItems} /> : null}

      <UploadProgressPanel />

      <CommandBar
        spaces={spaces}
        isAdmin={profile.is_admin}
        canUpload={editable}
        onUpload={() => requestUpload()}
      />

      {passwordOpen ? (
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setPasswordOpen(false);
          }}
        >
          <div className="glass-scrim absolute inset-0" />
          <form
            method="dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={changePassword}
            className="modal-box glass-content glass-appear flex flex-col gap-3 !bg-[var(--content-glass)] border-0 shadow-none"
            style={{ borderRadius: 22 }}
          >
            <div className="flex items-center gap-2">
              <h2 className="type-title flex-1">Change password</h2>
              <button
                type="button"
                aria-label="Close"
                className="dock-btn !px-2"
                onClick={() => setPasswordOpen(false)}
              >
                ×
              </button>
            </div>
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              required
              minLength={8}
              autoComplete="new-password"
            />
            {passwordMsg ? (
              <p className="type-caption">{passwordMsg}</p>
            ) : null}
            <div className="flex justify-end gap-2 mt-2">
              <GlassButton
                variant="glass"
                onClick={() => setPasswordOpen(false)}
              >
                Cancel
              </GlassButton>
              <GlassButton variant="primary" type="submit">
                Save
              </GlassButton>
            </div>
          </form>
          <form method="dialog" className="modal-backdrop bg-transparent">
            <button type="button" onClick={() => setPasswordOpen(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
