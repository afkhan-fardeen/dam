import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { DriveChromeProvider } from "@/components/DriveChrome";
import { DriveShell } from "@/components/DriveShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { spaces, memberships, profile, user, viewingAs } =
    await getUserSpaces();
  if (!user || !profile) {
    redirect("/login");
  }

  return (
    <DriveChromeProvider>
      <Suspense fallback={<div className="min-h-screen bg-base-100" />}>
        <DriveShell
          spaces={spaces}
          memberships={memberships}
          profile={profile}
          viewingAs={viewingAs}
        >
          {children}
        </DriveShell>
      </Suspense>
    </DriveChromeProvider>
  );
}
