import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminSpacesClient } from "@/components/admin/AdminSpacesClient";

export default async function AdminSpacesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">
        Spaces
      </h1>
      <p className="admin-page-caption">
        Brands and departments people can open.
      </p>
      <AdminSpacesClient />
    </div>
  );
}
