import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { DriveChromeProvider } from "@/components/DriveChrome";
import { DriveShell } from "@/components/DriveShell";
import { ToastProvider } from "@/components/ui/Toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { spaces, memberships, profile, viewingAs } = await getUserSpaces();
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-[var(--ink-soft)]">
        Portal is not configured. Ensure SUPABASE_SERVICE_ROLE_KEY and a profile
        for PORTAL_LOGIN_EMAIL exist.
      </div>
    );
  }

  return (
    <DriveChromeProvider>
      <ToastProvider>
        <Suspense fallback={<div className="min-h-screen" />}>
          <DriveShell
            spaces={spaces}
            memberships={memberships}
            profile={profile}
            viewingAs={viewingAs}
          >
            {children}
          </DriveShell>
        </Suspense>
      </ToastProvider>
    </DriveChromeProvider>
  );
}
