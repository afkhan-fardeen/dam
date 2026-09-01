import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { GlobalSearchClient } from "@/components/GlobalSearchClient";

export default async function SearchPage() {
  const { spaces, profile } = await getUserSpaces();
  if (!profile) {
    return (
      <div className="p-5 text-sm text-[var(--ink-soft)]">
        Portal is not configured.
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-base-content/60">Searching…</div>
      }
    >
      <GlobalSearchClient spaces={spaces} />
    </Suspense>
  );
}
