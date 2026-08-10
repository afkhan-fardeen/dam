import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminEntitiesClient } from "@/components/admin/AdminEntitiesClient";

export default async function AdminEntitiesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Entities</h1>
      <p className="admin-page-caption">
        Merge duplicates, rename, and archive business entities.
      </p>
      <AdminEntitiesClient />
    </div>
  );
}
