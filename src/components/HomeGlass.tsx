"use client";

import { useDriveChrome } from "@/components/DriveChrome";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import {
  lastPlaceHref,
  lastPlaceLabel,
  readLastPlace,
  type LastPlace,
} from "@/lib/lastPlace";
import { useEffect, useMemo, useState } from "react";

type HomeGlassProps = {
  profileName: string;
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

export function HomeGlass({ profileName }: HomeGlassProps) {
  const navigate = useViewTransitionNavigate();
  const { serverStatus } = useDriveChrome();
  const [continuePlace, setContinuePlace] = useState<LastPlace | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setContinuePlace(readLastPlace());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/storage/summary");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStorageError(json.error || "Could not load storage.");
          return;
        }
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
        if (!cancelled) setStorageError("Could not load storage.");
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

  const maxPlaceBytes = useMemo(() => {
    if (!storage?.places.length) return 1;
    return Math.max(1, ...storage.places.map((p) => p.bytes));
  }, [storage]);

  return (
    <div className="home-hub">
      <div className="home-hub-inner">
        <header className="home-hub-hero">
          <h1 className="home-hub-greeting">
            {greetingHour()}, {firstName}
          </h1>

          {continuePlace ? (
            <button
              type="button"
              className="home-hub-continue"
              onClick={() => navigate(lastPlaceHref(continuePlace))}
            >
              <span className="home-hub-continue-label">
                Continue where you left off
              </span>
              <span className="home-hub-continue-place">
                {lastPlaceLabel(continuePlace)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="home-hub-continue"
              onClick={() => navigate("/browse")}
            >
              <span className="home-hub-continue-label">Open a place</span>
              <span className="home-hub-continue-place">
                Browse places to get started
              </span>
            </button>
          )}
        </header>

        <section className="home-hub-storage" aria-label="Library storage">
          <div className="home-hub-storage-head">
            <h2 className="home-hub-section-title">Library storage</h2>
            {storage ? (
              <p className="home-hub-storage-total">
                {formatBytes(storage.usedBytes)} used
                {storage.quotaBytes != null ? (
                  <>
                    {" "}
                    · {formatBytes(storage.availableBytes ?? 0)} available
                  </>
                ) : null}
              </p>
            ) : (
              <p className="home-hub-storage-total">
                {storageError || "Loading…"}
              </p>
            )}
          </div>

          {storage && storage.quotaBytes != null && usedPct != null ? (
            <div
              className="home-hub-quota"
              role="meter"
              aria-valuenow={Math.round(usedPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Storage used"
            >
              <div
                className="home-hub-quota-fill"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          ) : null}

          {storage && storage.places.length > 0 ? (
            <ul className="home-hub-places">
              {storage.places.map((place) => {
                const width = Math.max(
                  4,
                  (place.bytes / maxPlaceBytes) * 100,
                );
                return (
                  <li key={place.space_id}>
                    <button
                      type="button"
                      className="home-hub-place"
                      onClick={() =>
                        navigate(`/s/${encodeURIComponent(place.slug)}`)
                      }
                    >
                      <span
                        className="home-hub-place-dot"
                        style={{ backgroundColor: place.color }}
                        aria-hidden
                      />
                      <span className="home-hub-place-main">
                        <span className="home-hub-place-name">{place.name}</span>
                        <span className="home-hub-place-bar" aria-hidden>
                          <span
                            className="home-hub-place-bar-fill"
                            style={{
                              width: `${width}%`,
                              backgroundColor: place.color,
                            }}
                          />
                        </span>
                      </span>
                      <span className="home-hub-place-size">
                        {formatBytes(place.bytes)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <button
          type="button"
          className="home-hub-browse"
          onClick={() => navigate("/browse")}
        >
          Browse places
        </button>

        {serverStatus === "offline" ? (
          <p className="home-hub-offline" role="status">
            File server unavailable — uploads paused
          </p>
        ) : null}
      </div>
    </div>
  );
}
