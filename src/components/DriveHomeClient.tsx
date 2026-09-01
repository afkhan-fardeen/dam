"use client";

import { useSearchParams } from "next/navigation";
import { DriveWorkspace } from "@/components/DriveWorkspace";
import { FsBrowseClient } from "@/components/FsBrowseClient";

type Props = {
  isAdmin: boolean;
  profileName: string;
};

export function DriveHomeClient({ isAdmin, profileName }: Props) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "files";

  if (
    view === "trash" ||
    view === "recent" ||
    view === "starred" ||
    view === "favorites"
  ) {
    return <FsBrowseClient isAdmin={isAdmin} />;
  }

  return <DriveWorkspace isAdmin={isAdmin} profileName={profileName} />;
}
