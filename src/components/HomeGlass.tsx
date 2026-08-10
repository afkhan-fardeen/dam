"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { IconFolder, IconServer, IconStack2 } from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { SearchTypeahead } from "@/components/SearchTypeahead";
import { SearchField } from "@/components/ui/SearchField";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import {
  lastPlaceHref,
  lastPlaceLabel,
  readLastPlace,
  type LastPlace,
} from "@/lib/lastPlace";
import type { Space } from "@/lib/types";

type HomeGlassProps = {
  profileName: string;
  spaces: Space[];
};

type StoragePlace = {
  space_id: string;
  name: string;
  slug: string;
  color: string;
  bytes: number;
};

type StorageSummary = {
  usedBytes: number;
  quotaBytes: number | null;
  availableBytes: number | null;
  places: StoragePlace[];
};

function greetingHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function HomeGlass({ profileName, spaces }: HomeGlassProps) {
  const navigate = useViewTransitionNavigate();
  const { serverStatus } = useDriveChrome();
  const [continuePlace, setContinuePlace] = useState<LastPlace | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setContinuePlace(readLastPlace());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/storage/summary");
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setStorage({
          usedBytes: Number(json.usedBytes) || 0,
          quotaBytes:
            typeof json.quotaBytes === "number" ? json.quotaBytes : null,
          availableBytes:
            typeof json.availableBytes === "number"
              ? json.availableBytes
              : null,
          places: (json.places as StoragePlace[]) ?? [],
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = useMemo(() => {
    const n = profileName.trim();
    if (!n) return "there";
    return n.split(/\s+/)[0] || "there";
  }, [profileName]);

  const usedPct = useMemo(() => {
    if (!storage?.quotaBytes || storage.quotaBytes <= 0) return null;
    return Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100);
  }, [storage]);

  const placeRows = storage?.places?.length
    ? storage.places
    : spaces.map((s) => ({
        space_id: s.id,
        name: s.name,
        slug: s.slug,
        color: s.color,
        bytes: 0,
      }));

  const maxPlaceBytes = Math.max(1, ...placeRows.map((p) => p.bytes));

  const pcLabel =
    serverStatus === "connected"
      ? "Connected"
      : serverStatus === "checking"
        ? "Checking…"
        : "Offline";
  const pcTone =
    serverStatus === "connected"
      ? "ok"
      : serverStatus === "checking"
        ? "muted"
        : "danger";

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="home-dash">
      <div className="home-dash-inner">
        <header className="home-dash-header">
          <div>
            <p className="home-dash-kicker">Library</p>
            <h1 className="home-dash-greeting">
              {greetingHour()}, {firstName}
            </h1>
          </div>
          {continuePlace ? (
            <button
              type="button"
              className="home-dash-continue"
              onClick={() => navigate(lastPlaceHref(continuePlace))}
            >
              <span className="home-dash-continue-label">Continue</span>
              <span className="home-dash-continue-place">
                {lastPlaceLabel(continuePlace)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="home-dash-continue"
              onClick={() => navigate("/browse")}
            >
              <span className="home-dash-continue-label">Get started</span>
              <span className="home-dash-continue-place">Browse spaces</span>
            </button>
          )}
        </header>

        <div className="home-dash-search">
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSearchOpen(v.trim().length >= 2);
            }}
            onSubmit={onSearchSubmit}
            onClear={() => {
              setQuery("");
              setSearchOpen(false);
            }}
            placeholder="Search files, folders, tags…"
            showCmdK={false}
            autoFocus={false}
            dropdown={
              searchOpen ? (
                <SearchTypeahead
                  query={query}
                  spaces={spaces}
                  onClose={() => setSearchOpen(false)}
                  onSelect={() => setSearchOpen(false)}
                />
              ) : null
            }
          />
        </div>

        <section className="home-dash-kpis" aria-label="Overview">
          <article className="home-kpi">
            <div className="home-kpi-icon" aria-hidden>
              <IconStack2 size={18} stroke={1.75} />
            </div>
            <div className="home-kpi-body">
              <p className="home-kpi-label">Storage used</p>
              <p className="home-kpi-value">
                {storage ? formatBytes(storage.usedBytes) : "—"}
              </p>
              {storage?.quotaBytes != null ? (
                <p className="home-kpi-meta">
                  {formatBytes(storage.availableBytes ?? 0)} available
                </p>
              ) : (
                <p className="home-kpi-meta">Across your spaces</p>
              )}
              {usedPct != null ? (
                <div className="home-kpi-bar" aria-hidden>
                  <span style={{ width: `${usedPct}%` }} />
                </div>
              ) : null}
            </div>
          </article>

          <article className="home-kpi">
            <div className="home-kpi-icon" aria-hidden>
              <IconFolder size={18} stroke={1.75} />
            </div>
            <div className="home-kpi-body">
              <p className="home-kpi-label">Spaces</p>
              <p className="home-kpi-value">{spaces.length}</p>
              <p className="home-kpi-meta">
                {spaces.length === 1 ? "Space you can open" : "Spaces you can open"}
              </p>
            </div>
          </article>

          <article className={`home-kpi home-kpi--pc is-${pcTone}`}>
            <div className="home-kpi-icon" aria-hidden>
              <IconServer size={18} stroke={1.75} />
            </div>
            <div className="home-kpi-body">
              <p className="home-kpi-label">File PC</p>
              <p className="home-kpi-value">{pcLabel}</p>
              <p className="home-kpi-meta">
                {serverStatus === "connected"
                  ? "Uploads and previews ready"
                  : serverStatus === "checking"
                    ? "Checking connection…"
                    : "Uploads paused until online"}
              </p>
            </div>
          </article>
        </section>

        <section className="home-dash-places" aria-label="Spaces">
          <div className="home-dash-places-head">
            <h2 className="home-dash-section-title">Your spaces</h2>
            <button
              type="button"
              className="home-dash-link"
              onClick={() => navigate("/browse")}
            >
              View all
            </button>
          </div>
          {placeRows.length === 0 ? (
            <p className="home-dash-empty">No spaces yet — ask an admin.</p>
          ) : (
            <ul className="home-dash-place-list">
              {placeRows.map((place) => {
                const width = Math.max(6, (place.bytes / maxPlaceBytes) * 100);
                return (
                  <li key={place.space_id}>
                    <button
                      type="button"
                      className="home-dash-place"
                      onClick={() =>
                        navigate(`/s/${encodeURIComponent(place.slug)}`)
                      }
                    >
                      <span
                        className="home-dash-place-dot"
                        style={{ backgroundColor: place.color }}
                        aria-hidden
                      />
                      <span className="home-dash-place-main">
                        <span className="home-dash-place-name">{place.name}</span>
                        <span className="home-dash-place-bar" aria-hidden>
                          <span
                            style={{
                              width: `${width}%`,
                              backgroundColor: place.color,
                            }}
                          />
                        </span>
                      </span>
                      <span className="home-dash-place-size">
                        {formatBytes(place.bytes)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
