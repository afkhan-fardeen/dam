import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUserSpaces } from "@/lib/auth";
import { GlobalSearchClient } from "@/components/GlobalSearchClient";

export default async function SearchPage() {
  const { spaces, profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  return (
    <Suspense
      fallback={
        <div className="p-5 text-sm text-base-content/60">Searching…</div>
      }
    >
      <GlobalSearchClient spaces={spaces} />
    </Suspense>
  );
}
