import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { DriveHomeClient } from "@/components/DriveHomeClient";

export default async function HomePage() {
  const { profile } = await getUserSpaces();
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
        <div className="p-5 text-sm text-base-content/60">Loading…</div>
      }
    >
      <DriveHomeClient
        isAdmin={profile.is_admin}
        profileName={profile.full_name || profile.email || "You"}
      />
    </Suspense>
  );
}
