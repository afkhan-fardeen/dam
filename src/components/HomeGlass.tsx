"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconLock, IconStar } from "@tabler/icons-react";
import { SearchHero } from "@/components/glass/SearchHero";
import { SideCard, SideCardSection } from "@/components/glass/SideCard";
import type { Asset, Space } from "@/lib/types";

type ActivityEntry = {
  id: string;
  summary: string;
  created_at: string | null;
};

type HomeGlassProps = {
  spaces: Space[];
  profileName: string;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function greetingHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function HomeGlass({ spaces, profileName }: HomeGlassProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<Asset[]>([]);
  const [favorites, setFavorites] = useState<Asset[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const firstName = useMemo(() => {
    const n = profileName.trim();
    if (!n) return "there";
    return n.split(/\s+/)[0] || "there";
  }, [profileName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rRes, fRes, aRes] = await Promise.all([
          fetch("/api/search?view=recent"),
          fetch("/api/favorites"),
          fetch("/api/activity/feed"),
        ]);
        const [rJson, fJson, aJson] = await Promise.all([
          rRes.json(),
          fRes.json(),
          aRes.json(),
        ]);
        if (cancelled) return;
        if (rRes.ok) setRecent(((rJson.assets as Asset[]) ?? []).slice(0, 4));
        if (fRes.ok) setFavorites(((fJson.assets as Asset[]) ?? []).slice(0, 4));
        if (aRes.ok)
          setActivity(((aJson.entries as ActivityEntry[]) ?? []).slice(0, 4));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  // Live navigate while typing (debounced) — matches DriveShell search
  useEffect(() => {
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      if (!trimmed) return;
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [query, router]);

  const suggestions = (
    <>
      {["contracts", "campaign", "logo"].map((s) => (
        <button
          key={s}
          type="button"
          className="tag-chip hover:bg-white/55 transition-colors"
          onClick={() => {
            setQuery(s);
            router.push(`/search?q=${encodeURIComponent(s)}`);
          }}
        >
          {s}
        </button>
      ))}
    </>
  );

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-52px-5.5rem)] px-4 pb-24">
        <p className="type-greeting mb-1 text-center">
          {greetingHour()},{" "}
          <span className="text-[var(--ink)] font-semibold">{firstName}</span>
        </p>
        <p className="type-caption mb-8 text-center">{formatDate()}</p>
        <SearchHero
          value={query}
          onChange={setQuery}
          onSubmit={submitSearch}
          placeholder="Search files, entities, spaces…"
          showCmdK
          glow
          suggestions={suggestions}
          className="w-full max-w-[560px]"
        />
      </div>

      <SideCard side="left">
        <SideCardSection label="Spaces">
          {spaces.length === 0 ? (
            <p className="type-caption px-2.5 py-2">No spaces yet</p>
          ) : (
            spaces.slice(0, 5).map((space) => (
              <Link
                key={space.id}
                href={`/s/${space.slug}`}
                className="card-row"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: space.color }}
                />
                <span className="truncate flex-1">{space.name}</span>
                {space.requires_passcode ? (
                  <IconLock
                    size={13}
                    stroke={1.75}
                    className="text-[var(--ink-faint)] shrink-0"
                  />
                ) : null}
              </Link>
            ))
          )}
        </SideCardSection>
        <div className="card-divider" />
        <SideCardSection label="Recently viewed">
          {recent.length === 0 ? (
            <p className="type-caption px-2.5 py-2">Nothing recent</p>
          ) : (
            recent.map((a) => (
              <Link
                key={a.id}
                href={`/search?q=${encodeURIComponent(a.original_name || "")}`}
                className="card-row"
                title={a.original_name || undefined}
              >
                <span className="truncate flex-1">
                  {a.original_name || "Untitled"}
                </span>
                <span className="type-caption shrink-0">
                  {relativeTime(a.created_at)}
                </span>
              </Link>
            ))
          )}
        </SideCardSection>
      </SideCard>

      <SideCard side="right">
        <SideCardSection label="Activity">
          {activity.length === 0 ? (
            <p className="type-caption px-2.5 py-2">No activity yet</p>
          ) : (
            activity.map((e) => (
              <div key={e.id} className="card-row cursor-default">
                <span className="truncate flex-1 font-normal">{e.summary}</span>
                <span className="type-caption shrink-0">
                  {relativeTime(e.created_at)}
                </span>
              </div>
            ))
          )}
        </SideCardSection>
        <div className="card-divider" />
        <SideCardSection label="Favorites">
          {favorites.length === 0 ? (
            <p className="type-caption px-2.5 py-2">No favorites yet</p>
          ) : (
            favorites.map((a) => (
              <Link
                key={a.id}
                href={`/search?q=${encodeURIComponent(a.original_name || "")}`}
                className="card-row"
                title={a.original_name || undefined}
              >
                <IconStar
                  size={13}
                  stroke={1.75}
                  className="text-[var(--ink-faint)] shrink-0"
                />
                <span className="truncate flex-1">
                  {a.original_name || "Untitled"}
                </span>
              </Link>
            ))
          )}
        </SideCardSection>
      </SideCard>
    </>
  );
}
