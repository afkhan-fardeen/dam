import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { AllFilesClient } from "@/components/AllFilesClient";

export default async function HomePage() {
  const { spaces, memberships, profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-base-content/60">Loading…</div>
      }
    >
      <AllFilesClient
        spaces={spaces}
        memberships={memberships}
        isAdmin={profile.is_admin}
      />
    </Suspense>
  );
}
