import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminAttributesClient } from "@/components/admin/AdminAttributesClient";

export default async function AdminAttributesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Attributes</h1>
      <p className="admin-page-caption">
        Typed fields like invoice numbers and AWBs for documents.
      </p>
      <AdminAttributesClient />
    </div>
  );
}
