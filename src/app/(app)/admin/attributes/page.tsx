import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminAttributesClient } from "@/components/admin/AdminAttributesClient";

export default async function AdminAttributesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-5xl">
      <h1 className="type-page">Attributes</h1>
      <p className="type-caption mt-1 mb-2">
        Typed fields like invoice numbers and AWBs for documents.
      </p>
      <AdminAttributesClient />
    </div>
  );
}
