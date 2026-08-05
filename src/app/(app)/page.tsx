import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { HomeClient } from "@/components/HomeClient";

export default async function HomePage() {
  const { spaces, memberships, profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  return (
    <Suspense fallback={<div className="p-5"><div className="glass-content p-4"><div className="glass-shimmer h-3 w-1/3 mb-3" /><div className="glass-shimmer h-3 w-full mb-2" /><div className="glass-shimmer h-3 w-2/3" /></div></div>}>
      <HomeClient
        spaces={spaces}
        memberships={memberships}
        profileName={profile.full_name || profile.email || ""}
        isAdmin={profile.is_admin}
      />
    </Suspense>
  );
}
