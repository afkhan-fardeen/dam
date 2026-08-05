import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminEntitiesClient } from "@/components/admin/AdminEntitiesClient";

export default async function AdminEntitiesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-5xl">
      <h1 className="type-page">Entities</h1>
      <p className="text-sm text-base-content/60 mt-1 mb-2">
        Merge duplicates, rename, and archive business entities.
      </p>
      <AdminEntitiesClient />
    </div>
  );
}
