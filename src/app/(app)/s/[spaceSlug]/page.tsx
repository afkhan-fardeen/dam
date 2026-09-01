import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces, roleForSpace } from "@/lib/auth";
import { FsSpaceWorkspace } from "@/components/FsSpaceWorkspace";

type PageProps = {
  params: Promise<{ spaceSlug: string }>;
};

export default async function SpacePage({ params }: PageProps) {
  const { spaceSlug } = await params;
  const { spaces, memberships, profile, user } = await getUserSpaces();

  if (!user || !profile) redirect("/login");

  const space = spaces.find((s) => s.slug === spaceSlug);
  if (!space) notFound();

  const role = roleForSpace(memberships, space.id, profile.is_admin);

  return (
    <Suspense fallback={<div className="p-5 text-sm text-base-content/60">Loading…</div>}>
      <FsSpaceWorkspace
        space={space}
        role={role}
        isAdmin={profile.is_admin}
        profileName={profile.full_name || profile.email || "You"}
      />
    </Suspense>
  );
}
