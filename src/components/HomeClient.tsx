"use client";

import { useSearchParams } from "next/navigation";
import { FsBrowseClient } from "@/components/FsBrowseClient";
import { HomeGlass } from "@/components/HomeGlass";
import type { Space, SpaceMembership } from "@/lib/types";

type HomeClientProps = {
  spaces: Space[];
  memberships: SpaceMembership[];
  profileName: string;
  isAdmin: boolean;
};

export function HomeClient({
  spaces,
  memberships,
  profileName,
  isAdmin,
}: HomeClientProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "all";

  if (view === "all") {
    return <HomeGlass profileName={profileName} spaces={spaces} />;
  }

  return (
    <FsBrowseClient
      spaces={spaces}
      memberships={memberships}
      isAdmin={isAdmin}
    />
  );
}
