"use client";

import { useSearchParams } from "next/navigation";
import { AllFilesClient } from "@/components/AllFilesClient";
import { HomeGlass } from "@/components/HomeGlass";
import { TrashClient } from "@/components/TrashClient";
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

  if (view === "trash") {
    return <TrashClient spaces={spaces} />;
  }

  return (
    <AllFilesClient
      spaces={spaces}
      memberships={memberships}
      isAdmin={isAdmin}
    />
  );
}
