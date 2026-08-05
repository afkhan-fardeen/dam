import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { HomeClient } from "@/components/HomeClient";

export default async function HomePage() {
  const { spaces, memberships, profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  return (
    <Suspense fallback={<div className="p-5 type-caption">Loading…</div>}>
      <HomeClient
        spaces={spaces}
        memberships={memberships}
        profileName={profile.full_name || profile.email || ""}
        isAdmin={profile.is_admin}
      />
    </Suspense>
  );
}
