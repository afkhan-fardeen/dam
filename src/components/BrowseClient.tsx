"use client";

import { useEffect, useState } from "react";
import { useViewTransitionNavigate } from "@/components/glass/useViewTransitionNavigate";
import { lastPlaceHref, readLastPlace } from "@/lib/lastPlace";
import type { Space } from "@/lib/types";

type BrowseClientProps = {
  spaces: Space[];
};

export function BrowseClient({ spaces }: BrowseClientProps) {
  const navigate = useViewTransitionNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const last = readLastPlace();
    if (last) {
      const allowed = spaces.some((s) => s.slug === last.spaceSlug);
      if (allowed) {
        navigate(lastPlaceHref(last));
        return;
      }
    }
    setReady(true);
  }, [spaces, navigate]);

  if (!ready) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto pb-8 pt-2">
        <div className="glass-content p-6">
          <div className="glass-shimmer h-3 w-1/3 mb-3" />
          <div className="glass-shimmer h-3 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto pb-8 pt-2">
      <div>
        <h1 className="type-page">Places</h1>
        <p className="type-caption mt-1">Open a place to browse files.</p>
      </div>

      {spaces.length === 0 ? (
        <div className="glass-content p-8 text-center">
          <p className="type-body text-[var(--ink-soft)]">
            No places to browse yet. Ask an admin for access.
          </p>
        </div>
      ) : (
        <ul className="glass-content p-2 flex flex-col gap-0.5">
          {spaces.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="card-row w-full text-left"
                onClick={() => navigate(`/s/${s.slug}`)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="flex-1 truncate type-body text-[var(--ink)]">
                  {s.name}
                </span>
                <span className="type-caption capitalize">
                  {s.kind === "brand"
                    ? "Brand"
                    : s.kind === "department"
                      ? "Team"
                      : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
