import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { EntityProfileClient } from "@/components/EntityProfileClient";

type PageProps = {
  params: Promise<{ entityId: string }>;
};

export default async function EntityPage({ params }: PageProps) {
  const { entityId } = await params;
  const { user, profile } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-base-content/60">Loading…</div>
      }
    >
      <EntityProfileClient entityId={entityId} />
    </Suspense>
  );
}
