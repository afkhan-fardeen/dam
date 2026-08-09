"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconFolder,
  IconKey,
  IconLogout,
  IconMenu2,
  IconSettings,
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
import { TopBar } from "@/components/ui/TopBar";
import { AppSidebar } from "@/components/ui/AppSidebar";
import { Menu } from "@/components/ui/Menu";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SearchField } from "@/components/ui/SearchField";
import { navigateWithTransition } from "@/components/ui/useViewTransitionNavigate";
import { readLastPlace } from "@/lib/lastPlace";

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
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showSidebar = !onEntity;

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!actionToast) return;
    const id = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [actionToast]);

  function uploadBlockedReason(): string | undefined {
    if (serverStatus === "checking") return "Checking PC…";
    if (!online) return "File server unavailable — uploads and previews may fail";
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

  const editableDestinations = useMemo(
    () =>
      spaces
        .filter((s) => {
          const r = roleForSpace(memberships, s.id, profile.is_admin);
          return canEdit(r, profile.is_admin);
        })
        .map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
    [spaces, memberships, profile.is_admin],
  );

  const uploadSpace =
    spaces.find((s) => s.id === shellUploadSpaceId) ?? null;
  const uploadFolderId = activeSlug ? searchParams.get("folder") : null;
  const [uploadFolderName, setUploadFolderName] = useState<string | null>(null);
  const [uploadSpaceName, setUploadSpaceName] = useState("Place");

  useEffect(() => {
    if (!uploadOpen) return;
    const last = readLastPlace();
    if (uploadFolderId) {
      setUploadFolderName(
        last?.folderId === uploadFolderId ? last.folderName : "Folder",
      );
    } else {
      setUploadFolderName(null);
    }
    setUploadSpaceName(
      (activeSlug && activeSpace?.name) ||
        uploadSpace?.name ||
        last?.spaceName ||
        "Place",
    );
  }, [
    uploadOpen,
    uploadFolderId,
    activeSlug,
    activeSpace?.name,
    uploadSpace?.name,
  ]);

  const avatarTrigger = (
    <span className="inline-flex items-center justify-center h-8 w-8 rounded-[6px] border border-[rgba(60,60,67,0.12)] bg-[#fafafa] text-[11px] font-medium text-[var(--ink)]">
      {initials || <IconUser size={14} />}
    </span>
  );

  const showTopSearch = !onAdmin && !onEntity;

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, searchParams]);

  return (
    <div
      className={`app-shell min-h-screen flex flex-col relative bg-[var(--bg)]${
        showSidebar ? " has-sidebar" : ""
      }`}
    >
      {viewingAs ? (
        <div className="shrink-0 surface mx-3 mt-2 px-4 py-2 flex items-center justify-between gap-3 type-body">
          <span>
            Viewing as {viewingAs.full_name || viewingAs.email || "user"}
          </span>
          <Button variant="secondary" onClick={() => void exitViewAs()}>
            Exit
          </Button>
        </div>
      ) : null}

      <TopBar
        brandLabel="Assets"
        brandHref="/"
        serverStatus={serverStatus}
        leading={
          showSidebar ? (
            <button
              type="button"
              className="topbar-menu-btn"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <IconMenu2 size={20} stroke={1.75} />
            </button>
          ) : undefined
        }
        center={
          showTopSearch ? (
            <SearchField
              value={query}
              onChange={setQuery}
              onSubmit={submitSearch}
              onClear={clearSearch}
              placeholder="Search files and folders…"
              showCmdK={!showHomeHero}
              slim
            />
          ) : null
        }
        trailing={
          <div className="topbar-actions">
            {!onAdmin && !onEntity ? (
              <>
                {activeSlug ? (
                  <button
                    type="button"
                    className={`topbar-action-btn${!editable ? " is-disabled" : ""}`}
                    aria-disabled={!editable}
                    title={editable ? "New folder" : "View only"}
                    onClick={() => {
                      if (!editable) {
                        setActionToast("View only — ask an editor");
                        return;
                      }
                      requestNewFolder();
                    }}
                  >
                    <IconFolder size={16} stroke={1.75} />
                    <span className="topbar-action-label">New folder</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`topbar-action-btn topbar-action-btn--primary${
                    !(canShellUpload && (!activeSlug || editable))
                      ? " is-disabled"
                      : ""
                  }`}
                  aria-disabled={!(canShellUpload && (!activeSlug || editable))}
                  title={uploadTitle || "Upload"}
                  onClick={() => {
                    if (!(canShellUpload && (!activeSlug || editable))) {
                      if (uploadTitle) setActionToast(uploadTitle);
                      return;
                    }
                    openUpload(activeSpace?.id ?? defaultUploadSpaceId);
                  }}
                >
                  <IconUpload size={16} stroke={1.75} />
                  <span className="topbar-action-label">Upload</span>
                </button>
              </>
            ) : null}
            <Menu trigger={avatarTrigger}>
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
                <IconKey size={15} /> Settings
              </button>
              <div className="card-divider" />
              <button
                type="button"
                className="menu-row menu-row-danger"
                onClick={() => void signOut()}
              >
                <IconLogout size={15} /> Sign out
              </button>
            </Menu>
          </div>
        }
      />

      <div className="app-body flex-1 min-h-0 flex relative">
        {showSidebar ? (
          <AppSidebar
            spaces={spaces}
            showTrash={showTrash}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            mode={onAdmin ? "admin" : "employee"}
          />
        ) : null}

        <main
          className={`flat-content-root flex-1 min-w-0 ${
            showHomeHero ? "" : "overflow-auto pb-6 px-4 sm:px-6"
          }`}
        >
          {children}
        </main>
      </div>

      {actionToast ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] surface flat-fade px-4 py-2.5 type-caption text-[var(--ink)] max-w-[min(90vw,20rem)] text-center"
          role="status"
        >
          {actionToast}
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
          spaceName={uploadSpaceName}
          spaceSlug={
            uploadSpace?.slug ||
            activeSpace?.slug ||
            editableDestinations.find((d) => d.id === shellUploadSpaceId)
              ?.slug ||
            ""
          }
          folderId={uploadFolderId}
          folderName={uploadFolderName}
          destinationOptions={editableDestinations}
          defaultCreatedBy={profile.full_name || profile.email || ""}
          onCancel={() => closeUpload()}
          onStarted={() => {
            closeUpload();
          }}
        />
      ) : null}

      {passwordOpen ? (
        <Modal
          title="Change password"
          onClose={() => setPasswordOpen(false)}
          onSubmit={changePassword}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPasswordOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Update password
              </Button>
            </>
          }
        >
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
        </Modal>
      ) : null}
    </div>
  );
}
