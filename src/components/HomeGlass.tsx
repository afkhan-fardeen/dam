"use client";

import { useDriveChrome } from "@/components/DriveChrome";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import {
  lastPlaceHref,
  lastPlaceLabel,
  readLastPlace,
  type LastPlace,
} from "@/lib/lastPlace";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { SearchTypeahead } from "@/components/SearchTypeahead";

type HomeGlassProps = {
  profileName: string;
  spaces?: import("@/lib/types").Space[];
};

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

function statusCaption(
  status: "checking" | "connected" | "offline",
): string {
  switch (status) {
    case "connected":
      return "Ready to upload";
    case "checking":
      return "Checking PC…";
    default:
      return "File server unavailable — uploads paused";
  }
}

export function HomeGlass({ profileName, spaces = [] }: HomeGlassProps) {
  const navigate = useViewTransitionNavigate();
  const { serverStatus } = useDriveChrome();
  const [query, setQuery] = useState("");
  const [continuePlace, setContinuePlace] = useState<LastPlace | null>(null);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);

  useEffect(() => {
    setContinuePlace(readLastPlace());
  }, []);

  const firstName = useMemo(() => {
    const n = profileName.trim();
    if (!n) return "there";
    return n.split(/\s+/)[0] || "there";
  }, [profileName]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setTypeaheadOpen(false);
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--bar-h)-var(--dock-h))] px-4 pb-20">
      <div className="flat-fade flex flex-col items-center w-full max-w-[560px]">
        <p className="type-greeting mb-1 text-center">
          {greetingHour()},{" "}
          <span className="font-bold">{firstName}</span>
        </p>
        <p className="type-caption mb-8 text-center">{formatDate()}</p>
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setTypeaheadOpen(v.trim().length >= 2);
          }}
          onSubmit={submitSearch}
          placeholder="Search files and folders…"
          showCmdK
          className="w-full"
          dropdown={
            typeaheadOpen ? (
              <SearchTypeahead
                query={query}
                spaces={spaces}
                onClose={() => setTypeaheadOpen(false)}
                onSelect={() => setTypeaheadOpen(false)}
              />
            ) : null
          }
        />
        <p className="type-caption mt-4 text-center">
          {statusCaption(serverStatus)}
        </p>
        {continuePlace ? (
          <button
            type="button"
            className="type-caption mt-3 text-[var(--accent)] hover:underline"
            onClick={() => navigate(lastPlaceHref(continuePlace))}
          >
            Continue: {lastPlaceLabel(continuePlace)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
