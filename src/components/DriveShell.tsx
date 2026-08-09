"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconClock,
  IconFolder,
  IconFolders,
  IconKey,
  IconLock,
  IconLogout,
  IconSettings,
  IconStar,
  IconTrash,
  IconUpload,
  IconUser,
} from "@tabler/icons-react";
import { UploadForm } from "@/components/UploadForm";
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
  const {
    openUpload,
    closeUpload,
    uploadOpen,
    uploadSpaceId,
    requestNewFolder,
    serverOnline,
    serverStatus,
  } = useDriveChrome();

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
  const onBrowse = pathname === "/browse";
  const onSearch = pathname === "/search";
  const onAdmin = pathname.startsWith("/admin");
  const onEntity = pathname.startsWith("/e/");
  const online = serverOnline;
  const showHomeHero = onHome && view === "all";

  const defaultUploadSpaceId = useMemo(() => {
    if (activeSpace && canEdit(role, profile.is_admin)) return activeSpace.id;
    for (const s of spaces) {
      const r = roleForSpace(memberships, s.id, profile.is_admin);
      if (canEdit(r, profile.is_admin)) return s.id;
    }
    return profile.is_admin && spaces[0] ? spaces[0].id : null;
  }, [activeSpace, role, spaces, memberships, profile.is_admin]);

  const canShellUpload =
    Boolean(defaultUploadSpaceId) && online && view !== "trash";

  const showTrash =
    profile.is_admin || memberships.some((m) => m.role === "editor");

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [dockToast, setDockToast] = useState<string | null>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!dockToast) return;
    const id = window.setTimeout(() => setDockToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [dockToast]);

  function uploadBlockedReason(): string | undefined {
    if (serverStatus === "checking") return "Checking PC…";
    if (!online) return "PC offline";
    if (!defaultUploadSpaceId) return "No place to upload — ask an admin";
    if (view === "trash") return "Leave trash to upload";
    return undefined;
  }

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

  function clearSearch() {
    setQuery("");
    if (onSearch) {
      navigateWithTransition(router, "/");
    }
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

  const shellUploadSpaceId = uploadSpaceId || defaultUploadSpaceId;
  const uploadTitle = uploadBlockedReason();

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

    const uploadItem = (opts: {
      onClick: () => void;
      extraDisabled?: boolean;
    }): DockItem => ({
      id: "upload",
      label: "Upload",
      icon: <IconUpload size={15} stroke={1.75} />,
      primary: true,
      breathe: true,
      disabled: !canShellUpload || Boolean(opts.extraDisabled),
      title: uploadTitle,
      onClick: opts.onClick,
      onDisabledClick: () => {
        if (uploadTitle) setDockToast(uploadTitle);
      },
    });

    if (onSearch) {
      return [
        uploadItem({
          onClick: () => openUpload(defaultUploadSpaceId),
        }),
        {
          id: "new-search",
          label: "New Search",
          onClick: () => {
            setQuery("");
            navigateWithTransition(router, "/");
          },
        },
      ];
    }

    if (activeSlug) {
      const items: DockItem[] = [
        uploadItem({
          onClick: () => openUpload(activeSpace?.id ?? defaultUploadSpaceId),
          extraDisabled: !editable,
        }),
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
          href: "/?view=trash",
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

    // Home / Browse / Favorites / Recent
    return [
      uploadItem({
        onClick: () => openUpload(defaultUploadSpaceId),
      }),
      {
        id: "browse",
        label: "Browse",
        icon: <IconFolders size={15} stroke={1.75} />,
        href: "/browse",
        active: onBrowse,
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
  }, [
    onAdmin,
    onSearch,
    onBrowse,
    activeSlug,
    activeSpace,
    pathname,
    canShellUpload,
    editable,
    defaultUploadSpaceId,
    uploadTitle,
    showTrash,
    view,
    router,
    openUpload,
    requestNewFolder,
  ]);

  const avatarTrigger = (
    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full glass text-[11px] font-semibold text-[var(--ink)]">
      {initials || <IconUser size={14} />}
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
        brandLabel=""
        serverStatus={serverStatus}
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
          {onSearch || onBrowse || (!onAdmin && !activeSlug) ? (
            <SearchHero
              value={query}
              onChange={setQuery}
              onSubmit={submitSearch}
              onClear={clearSearch}
              placeholder="Search files and folders…"
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

      {dockToast ? (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55] glass-content glass-appear px-4 py-2.5 type-caption text-[var(--ink)] max-w-[min(90vw,20rem)] text-center shadow-lg"
          style={{ borderRadius: 14 }}
          role="status"
        >
          {dockToast}
        </div>
      ) : null}

      <UploadProgressPanel />

      <CommandBar
        spaces={spaces}
        isAdmin={profile.is_admin}
        canUpload={canShellUpload}
        onUpload={() => openUpload(defaultUploadSpaceId)}
      />

      {uploadOpen && shellUploadSpaceId ? (
        <UploadForm
          spaceId={shellUploadSpaceId}
          folderId={activeSlug ? searchParams.get("folder") : null}
          defaultCreatedBy={profile.full_name || profile.email || ""}
          onCancel={() => closeUpload()}
          onUploaded={() => {
            closeUpload();
            router.refresh();
          }}
        />
      ) : null}

      {passwordOpen ? (
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setPasswordOpen(false);
          }}
        >
          <div className="glass-scrim absolute inset-0 pointer-events-none" />
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
