"use client";

import { useEffect, useState } from "react";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import { Skeleton } from "@/components/ui/Skeleton";
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
        <Skeleton rows={2} />
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
        <div className="surface empty-state">
          <p className="type-title">No places yet</p>
          <p className="type-caption mt-2">Ask an admin for access.</p>
        </div>
      ) : (
        <ul className="surface overflow-hidden p-0 flex flex-col">
          {spaces.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="card-row"
                onClick={() => navigate(`/s/${s.slug}`)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="flex-1 truncate type-body">{s.name}</span>
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
