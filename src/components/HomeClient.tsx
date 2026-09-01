"use client";

import { DriveHomeClient } from "@/components/DriveHomeClient";

/** @deprecated Use DriveHomeClient */
export function HomeClient({
  profileName,
  isAdmin,
}: {
  spaces?: unknown;
  memberships?: unknown;
  profileName: string;
  isAdmin: boolean;
}) {
  return <DriveHomeClient isAdmin={isAdmin} profileName={profileName} />;
}
