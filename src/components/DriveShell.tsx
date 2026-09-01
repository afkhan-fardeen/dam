"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconFolderPlus,
  IconLayoutGrid,
  IconLayoutList,
  IconMenu2,
  IconPencil,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { UploadForm } from "@/components/UploadForm";
import { createClient } from "@/lib/supabase/client";
import {
  canEdit,
  type Space,
  type SpaceMembership,
  type Profile,
} from "@/lib/types";
import { roleForSpace } from "@/lib/auth-client";
import { useDriveChrome } from "@/components/DriveChrome";
import { UploadProgressPanel } from "@/components/UploadProgressPanel";
import { PasswordField } from "@/components/PasswordField";
import { CommandBar } from "@/components/CommandBar";
import { ExplorerNavPane } from "@/components/explorer/ExplorerNavPane";
import { ExplorerDetails } from "@/components/explorer/ExplorerDetails";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { navigateWithTransition } from "@/components/ui/useViewTransitionNavigate";
import { readLastPlace } from "@/lib/lastPlace";
import { readViewMode, writeViewMode } from "@/lib/uiPrefs";

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
    requestUpload,
    serverOnline,
    serverStatus,
    explorer,
    explorerActions,
    viewMode,
    setViewMode,
    setExplorer,
  } = useDriveChrome();

  const view = searchParams.get("view") || "files";
  const onHome = pathname === "/";
  const onSearch = pathname === "/search";
  const onAdmin = pathname.startsWith("/admin");
  const onEntity = pathname.startsWith("/e/");
  const online = serverOnline;

  const defaultUploadSpaceId = useMemo(() => {
    for (const s of spaces) {
      const r = roleForSpace(memberships, s.id, profile.is_admin);
      if (canEdit(r, profile.is_admin)) return s.id;
    }
    return profile.is_admin && spaces[0] ? spaces[0].id : null;
  }, [spaces, memberships, profile.is_admin]);

  const showTrash =
    profile.is_admin || memberships.some((m) => m.role === "editor");

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const historyRef = useRef<{ stack: string[]; index: number }>({
    stack: [],
    index: -1,
  });
  const [histTick, setHistTick] = useState(0);
  const skippingHistory = useRef(false);

  const showSidebar = !onEntity;
  const showExplorerChrome = !onAdmin && !onEntity;

  useEffect(() => {
    if (onSearch) {
      setExplorer({
        title: "Search",
        crumbs: [{ id: null, label: "Search" }],
        selected: null,
        itemCount: 0,
        canCreate: false,
        canUpload: false,
        canDelete: false,
        canRename: false,
        searchScopeLabel: "Company Files",
        parentFolderId: null,
      });
    }
  }, [onSearch, setExplorer]);

  useEffect(() => {
    if (onAdmin) {
      setExplorer({
        title: "Admin",
        crumbs: [{ id: null, label: "Admin" }],
        selected: null,
        itemCount: 0,
        canCreate: false,
        canUpload: false,
        canDelete: false,
        canRename: false,
        searchScopeLabel: "Company Files",
        parentFolderId: null,
      });
    }
  }, [onAdmin, setExplorer]);

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!actionToast) return;
    const id = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [actionToast]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Client history for back/forward
  useEffect(() => {
    const href = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
    const h = historyRef.current;
    if (skippingHistory.current) {
      skippingHistory.current = false;
      if (h.index >= 0) h.stack[h.index] = href;
      setHistTick((n) => n + 1);
      return;
    }
    if (h.stack[h.index] === href) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(href);
    h.index = h.stack.length - 1;
    setHistTick((n) => n + 1);
  }, [pathname, searchParams]);

  const canGoBack = historyRef.current.index > 0;
  const canGoForward =
    historyRef.current.index >= 0 &&
    historyRef.current.index < historyRef.current.stack.length - 1;
  void histTick;

  const folderId = searchParams.get("folder");
  const canGoUp =
    showExplorerChrome &&
    onHome &&
    view !== "trash" &&
    view !== "recent" &&
    Boolean(folderId || explorer.parentFolderId);

  function goHistory(delta: number) {
    const h = historyRef.current;
    const next = h.index + delta;
    if (next < 0 || next >= h.stack.length) return;
    skippingHistory.current = true;
    h.index = next;
    navigateWithTransition(router, h.stack[next]);
    setHistTick((n) => n + 1);
  }

  function goUp() {
    if (explorer.parentFolderId) {
      navigateWithTransition(
        router,
        `/?folder=${encodeURIComponent(explorer.parentFolderId)}`,
      );
      return;
    }
    if (folderId) {
      // parent unknown from URL — shell uses explorer.parentFolderId; fallback root
      navigateWithTransition(router, "/");
    }
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      navigateWithTransition(router, "/");
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

  const shellUploadSpaceId = uploadSpaceId || defaultUploadSpaceId;
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

  const uploadSpace = spaces.find((s) => s.id === shellUploadSpaceId) ?? null;
  const uploadFolderId = onHome ? searchParams.get("folder") : null;
  const [uploadFolderName, setUploadFolderName] = useState<string | null>(null);
  const [uploadSpaceName, setUploadSpaceName] = useState("Company Files");

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
    setUploadSpaceName(uploadSpace?.name || last?.spaceName || "Company Files");
  }, [uploadOpen, uploadFolderId, uploadSpace?.name]);

  const identityTitle = showExplorerChrome
    ? explorer.title
    : onAdmin
      ? "Admin"
      : onSearch
        ? "Search"
        : "Company Files";

  const statusText = explorer.selected
    ? `1 item selected`
    : `${explorer.itemCount} item${explorer.itemCount === 1 ? "" : "s"}`;

  const canNew = showExplorerChrome && explorer.canCreate && view !== "trash";
  const canUp =
    showExplorerChrome &&
    explorer.canUpload &&
    online &&
    view !== "trash";
  const canDel = showExplorerChrome && explorer.canDelete && explorer.selected;
  const canRen =
    showExplorerChrome &&
    explorer.canRename &&
    explorer.selected &&
    view !== "trash";

  function onUploadClick() {
    if (!canUp) {
      if (!online) setActionToast("File server unavailable");
      else setActionToast("Upload not available here");
      return;
    }
    // Prefer workspace file picker (flat drive); modal if spaces exist
    if (shellUploadSpaceId) {
      openUpload(shellUploadSpaceId);
    } else {
      requestUpload();
    }
  }

  return (
    <div className="xp-shell">
      {viewingAs ? (
        <div className="shrink-0 px-3 py-2 flex items-center justify-between gap-3 text-[12px] bg-[var(--win-selected)] border-b border-[var(--win-selected-border)]">
          <span>
            Viewing as {viewingAs.full_name || viewingAs.email || "user"}
          </span>
          <Button variant="secondary" onClick={() => void exitViewAs()}>
            Exit
          </Button>
        </div>
      ) : null}

      <div className="xp-identity">
        {showSidebar ? (
          <button
            type="button"
            className="xp-nav-btn xp-mobile-nav-btn"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <IconMenu2 size={16} />
          </button>
        ) : null}
        <div className="xp-identity-title">{identityTitle}</div>
        {onAdmin ? (
          <Link
            href="/"
            className="ml-auto text-[12px] text-[var(--win-accent)] hover:underline"
          >
            Back to files
          </Link>
        ) : null}
      </div>

      {showExplorerChrome ? (
        <div className="xp-cmdbar">
          <button
            type="button"
            className="xp-cmd"
            disabled={!canNew}
            title={canNew ? "New folder" : "Cannot create here"}
            onClick={() => {
              if (!canNew) return;
              requestNewFolder();
            }}
          >
            <IconFolderPlus size={14} stroke={1.75} />
            New
          </button>
          <button
            type="button"
            className="xp-cmd"
            disabled={!canUp}
            title={canUp ? "Upload" : "Upload unavailable"}
            onClick={onUploadClick}
          >
            <IconUpload size={14} stroke={1.75} />
            Upload
          </button>
          <span className="xp-cmd-sep" aria-hidden />
          <button
            type="button"
            className="xp-cmd"
            disabled={!canDel}
            title={
              view === "trash" ? "Delete permanently" : "Move to Recycle Bin"
            }
            onClick={() => explorerActions?.deleteSelection()}
          >
            <IconTrash size={14} stroke={1.75} />
            Delete
          </button>
          <button
            type="button"
            className="xp-cmd"
            disabled={!canRen}
            title="Rename"
            onClick={() => explorerActions?.renameSelection()}
          >
            <IconPencil size={14} stroke={1.75} />
            Rename
          </button>
        </div>
      ) : null}

      {showExplorerChrome ? (
        <div className="xp-addr">
          <button
            type="button"
            className="xp-nav-btn"
            disabled={!canGoBack}
            aria-label="Back"
            onClick={() => goHistory(-1)}
          >
            <IconArrowLeft size={15} />
          </button>
          <button
            type="button"
            className="xp-nav-btn"
            disabled={!canGoForward}
            aria-label="Forward"
            onClick={() => goHistory(1)}
          >
            <IconArrowRight size={15} />
          </button>
          <button
            type="button"
            className="xp-nav-btn"
            disabled={!canGoUp}
            aria-label="Up"
            onClick={goUp}
          >
            <IconArrowUp size={15} />
          </button>
          <div className="xp-breadcrumb" aria-label="Address">
            {explorer.crumbs.map((c, i) => {
              const last = i === explorer.crumbs.length - 1;
              return (
                <span key={`${c.id ?? "root"}-${i}`} className="inline-flex items-center gap-1 min-w-0">
                  {i > 0 ? (
                    <span className="xp-breadcrumb-sep">›</span>
                  ) : null}
                  {last ? (
                    <span className="xp-breadcrumb-current">{c.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        navigateWithTransition(
                          router,
                          c.id
                            ? `/?folder=${encodeURIComponent(c.id)}`
                            : "/",
                        )
                      }
                    >
                      {c.label}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <form onSubmit={submitSearch}>
            <input
              className="xp-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${explorer.searchScopeLabel}`}
              aria-label="Search"
            />
          </form>
        </div>
      ) : null}

      <div className="xp-body">
        {showSidebar ? (
          <ExplorerNavPane
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            profile={profile}
            serverStatus={serverStatus}
            showTrash={showTrash}
            mode={onAdmin ? "admin" : "employee"}
            onOpenSettings={() => {
              setPasswordOpen(true);
              setPasswordMsg(null);
            }}
            onSignOut={() => void signOut()}
          />
        ) : null}

        <div className="xp-main">
          <div
            className={`xp-content${onAdmin || onSearch ? " p-4 sm:p-6" : ""}`}
          >
            {children}
          </div>
          {showExplorerChrome ? (
            <div className="xp-statusbar">
              <span>{statusText}</span>
              <div className="xp-view-toggle" role="group" aria-label="View">
                <button
                  type="button"
                  className={viewMode === "list" ? "is-active" : ""}
                  title="List"
                  aria-pressed={viewMode === "list"}
                  onClick={() => {
                    setViewMode("list");
                    writeViewMode("list");
                  }}
                >
                  <IconLayoutList size={14} />
                </button>
                <button
                  type="button"
                  className={viewMode === "grid" ? "is-active" : ""}
                  title="Grid"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => {
                    setViewMode("grid");
                    writeViewMode("grid");
                  }}
                >
                  <IconLayoutGrid size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {showExplorerChrome && explorer.selected ? (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ExplorerDetails
              node={explorer.selected}
              canEditTags={
                Boolean(explorer.canCreate || explorer.selected.can_edit) &&
                view !== "trash"
              }
            />
          </div>
        ) : null}
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
        canUpload={canUp}
        onUpload={onUploadClick}
      />

      {uploadOpen && shellUploadSpaceId ? (
        <UploadForm
          spaceId={shellUploadSpaceId}
          spaceName={uploadSpaceName}
          spaceSlug={uploadSpace?.slug || ""}
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
