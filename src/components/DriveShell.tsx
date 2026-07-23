"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconClock,
  IconFolderPlus,
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLogout,
  IconMenu2,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconKey,
  IconUser,
  IconFiles,
  IconLock,
  IconX,
  IconSettings,
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
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "@/lib/uiPrefs";

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
  const online = health === "connected" && serverOnline;

  const showTrash =
    profile.is_admin || memberships.some((m) => m.role === "editor");

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerId] = useState(() => "drive-drawer");

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  // Live search: navigate as you type (debounced)
  useEffect(() => {
    const trimmed = query.trim();
    const onSearchPage = pathname === "/search";
    const urlQ = (searchParams.get("q") || "").trim();

    const handle = window.setTimeout(() => {
      if (!trimmed) {
        if (onSearchPage) router.push("/");
        return;
      }
      if (trimmed === urlQ && onSearchPage) return;
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }, 180);

    return () => window.clearTimeout(handle);
  }, [query, pathname, router, searchParams]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  function closeDrawer() {
    const el = document.getElementById(drawerId) as HTMLInputElement | null;
    if (el) el.checked = false;
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    closeDrawer();
    if (!trimmed) {
      router.push(activeSlug ? `/s/${activeSlug}` : "/");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
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

  const statusLabel =
    health === "connected"
      ? "Connected"
      : health === "checking"
        ? "Checking…"
        : "Server offline";

  const statusBadge =
    health === "connected"
      ? "badge-success"
      : health === "checking"
        ? "badge-neutral"
        : "badge-error";

  const uploadDisabled = !online || view === "trash";
  const uploadTooltip =
    view === "trash"
      ? "Switch out of Trash to upload"
      : !online
        ? "File server is offline — uploads are paused"
        : "";

  const allActive = onHome && view === "all";
  const recentActive = onHome && view === "recent";
  const trashActive =
    (onHome || Boolean(activeSlug)) && view === "trash";

  const sidebarWidth = collapsed ? "w-14" : "w-60";

  return (
    <div className="drawer lg:drawer-open min-h-screen">
      <input id={drawerId} type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-h-screen bg-base-100">
        {viewingAs ? (
          <div className="shrink-0 bg-neutral text-neutral-content px-4 py-2 flex items-center justify-between gap-3 type-body">
            <span>
              Viewing as {viewingAs.full_name || viewingAs.email || "user"}
            </span>
            <button
              type="button"
              onClick={() => void exitViewAs()}
              className="btn btn-ghost btn-xs text-neutral-content"
            >
              Exit
            </button>
          </div>
        ) : null}

        <div className="navbar min-h-14 bg-base-100 border-b border-base-300 px-3 sm:px-4 gap-3 sticky top-0 z-40 justify-start">
          <div className="flex-none lg:hidden">
            <label
              htmlFor={drawerId}
              className="btn btn-ghost btn-square"
              aria-label="Open menu"
            >
              <IconMenu2 size={20} />
            </label>
          </div>

          <div className="flex-1 min-w-0 flex justify-start">
            <form onSubmit={submitSearch} className="w-full max-w-xl">
              <label className="input input-bordered input-sm h-10 flex items-center gap-2 w-full bg-base-200 border-transparent focus-within:border-base-300 focus-within:bg-base-100">
                <IconSearch size={16} className="opacity-45 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files…"
                  className="grow min-w-0"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={() => {
                      setQuery("");
                      if (pathname === "/search") router.push("/");
                    }}
                  >
                    <IconX size={14} />
                  </button>
                ) : null}
              </label>
            </form>
          </div>

          <div className="flex-none flex items-center gap-2">
            {editable && activeSlug ? (
              <div className="dropdown dropdown-end">
                <div
                  tabIndex={0}
                  role="button"
                  className="btn btn-primary btn-sm gap-1.5"
                >
                  <IconPlus size={16} />
                  <span className="hidden sm:inline">New</span>
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 z-[100] w-48 p-1.5 shadow border border-base-300 type-body"
                >
                  <li>
                    <button
                      type="button"
                      className="gap-2 py-2"
                      onClick={() => requestNewFolder()}
                    >
                      <IconFolderPlus size={15} className="shrink-0" />
                      New folder
                    </button>
                  </li>
                  <li>
                    <div
                      className={
                        uploadDisabled ? "tooltip tooltip-left w-full" : "w-full"
                      }
                      data-tip={uploadDisabled ? uploadTooltip : undefined}
                    >
                      <button
                        type="button"
                        disabled={uploadDisabled}
                        className="w-full gap-2 py-2"
                        onClick={() => {
                          if (uploadDisabled) return;
                          requestUpload();
                        }}
                      >
                        <IconUpload size={15} className="shrink-0" />
                        Upload file
                      </button>
                    </div>
                  </li>
                </ul>
              </div>
            ) : null}

            <div
              className="flex items-center gap-2 px-1"
              title={statusLabel}
            >
              <span className={`badge badge-xs ${statusBadge}`} />
              <span className="type-caption opacity-60 hidden sm:inline">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>

      <div className="drawer-side z-30">
        <label
          htmlFor={drawerId}
          aria-label="Close menu"
          className="drawer-overlay"
        />
        <aside
          className={`bg-base-100 min-h-full ${sidebarWidth} flex flex-col border-r border-base-300`}
        >
          <div
            className={`flex items-center h-14 border-b border-base-300 shrink-0 ${
              collapsed ? "justify-center px-1" : "gap-1 px-2"
            }`}
          >
            {!collapsed ? (
              <Link
                href="/"
                onClick={closeDrawer}
                className="flex-1 min-w-0 px-2 py-1.5 hover:bg-base-200"
              >
                <span className="block type-label truncate leading-tight">
                  Company assets
                </span>
                <span className="block type-caption opacity-50 truncate leading-tight">
                  Drive
                </span>
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square hidden lg:inline-flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleCollapsed}
            >
              {collapsed ? (
                <IconLayoutSidebar size={18} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={18} />
              )}
            </button>
            <label
              htmlFor={drawerId}
              className="btn btn-ghost btn-sm btn-square lg:hidden"
              aria-label="Close menu"
            >
              <IconX size={18} />
            </label>
          </div>

          <nav
            className={`flex-1 overflow-y-auto flex flex-col gap-0.5 ${
              collapsed ? "items-center px-1 py-2" : "px-2 py-2"
            }`}
          >
            {!collapsed ? (
              <p className="type-micro opacity-45 px-2 pt-1 pb-1">
                Spaces
              </p>
            ) : null}
            {spaces.length === 0 ? (
              !collapsed ? (
                <p className="px-2 type-caption opacity-50">No spaces yet</p>
              ) : null
            ) : (
              spaces.map((space) => {
                const active = activeSlug === space.slug;
                const locked = Boolean(space.requires_passcode);
                return (
                  <Link
                    key={space.id}
                    href={`/s/${space.slug}`}
                    onClick={closeDrawer}
                    title={space.name}
                    className={`relative flex items-center gap-2 transition-colors ${
                      collapsed
                        ? "justify-center w-10 h-10"
                        : "w-full px-2 py-2"
                    } ${
                      active
                        ? "bg-base-200 font-medium"
                        : "hover:bg-base-200"
                    }`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0"
                      style={{ backgroundColor: space.color }}
                    />
                    {!collapsed ? (
                      <>
                        <span className="truncate flex-1 text-left type-label">
                          {space.name}
                        </span>
                        {locked ? (
                          <IconLock size={14} className="opacity-50 shrink-0" />
                        ) : null}
                      </>
                    ) : locked ? (
                      <IconLock
                        size={10}
                        className="absolute bottom-1 right-1 opacity-60"
                      />
                    ) : null}
                  </Link>
                );
              })
            )}

            <hr
              className={`border-base-300 my-2 ${collapsed ? "w-8" : "mx-1"}`}
            />

            {!collapsed ? (
              <p className="type-micro opacity-45 px-2 pt-0.5 pb-1">
                Browse
              </p>
            ) : null}

            {(
              [
                {
                  href: "/",
                  label: "All files",
                  active: allActive,
                  icon: IconFiles,
                },
                {
                  href: "/?view=recent",
                  label: "Recent",
                  active: recentActive,
                  icon: IconClock,
                },
                ...(showTrash
                  ? [
                      {
                        href: "/?view=trash",
                        label: "Trash",
                        active: trashActive,
                        icon: IconTrash,
                      },
                    ]
                  : []),
              ] as {
                href: string;
                label: string;
                active: boolean;
                icon: typeof IconFiles;
              }[]
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeDrawer}
                title={item.label}
                className={`flex items-center gap-2 transition-colors ${
                  collapsed
                    ? "justify-center w-10 h-10"
                    : "w-full px-2 py-2"
                } ${
                  item.active ? "bg-base-200 font-medium" : "hover:bg-base-200"
                }`}
              >
                <item.icon size={16} className="text-primary shrink-0" />
                {!collapsed ? (
                  <span className="type-label">{item.label}</span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div
            className={`shrink-0 border-t border-base-300 ${
              collapsed ? "p-1 flex justify-center" : "p-2"
            }`}
          >
            <div
              className={`dropdown ${collapsed ? "dropdown-right dropdown-end" : "dropdown-top dropdown-end"} w-full ${collapsed ? "w-auto" : ""}`}
            >
              <div
                tabIndex={0}
                role="button"
                className={`btn btn-ghost btn-sm gap-2 ${
                  collapsed
                    ? "btn-square w-10 h-10"
                    : "w-full justify-start px-2 h-auto py-2"
                }`}
                title={profile.full_name || profile.email || undefined}
              >
                <div className="avatar avatar-placeholder">
                  <div className="bg-neutral text-neutral-content w-8 h-8">
                    <span className="type-caption">
                      {initials || <IconUser size={14} />}
                    </span>
                  </div>
                </div>
                {!collapsed ? (
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block type-label truncate">
                      {profile.full_name || profile.email}
                    </span>
                    <span className="block type-caption opacity-50 truncate">
                      {profile.is_admin ? "Admin" : "Member"}
                    </span>
                  </span>
                ) : null}
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 z-[100] w-52 p-2 shadow border border-base-300"
              >
                {profile.is_admin ? (
                  <li>
                    <Link href="/admin/spaces" onClick={closeDrawer}>
                      <IconSettings size={16} />
                      Admin
                    </Link>
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordOpen(true);
                      setPasswordMsg(null);
                    }}
                  >
                    <IconKey size={16} />
                    Change password
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => void signOut()}>
                    <IconLogout size={16} />
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      <UploadProgressPanel />

      {passwordOpen ? (
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setPasswordOpen(false);
          }}
        >
          <form
            method="dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={changePassword}
            className="modal-box flex flex-col gap-3 rounded-none"
          >
            <div className="flex items-center gap-2">
              <h2 className="type-title flex-1">Change password</h2>
              <button
                type="button"
                aria-label="Close"
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setPasswordOpen(false)}
              >
                <IconX size={16} />
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
              <p className="type-caption opacity-60">{passwordMsg}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setPasswordOpen(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
