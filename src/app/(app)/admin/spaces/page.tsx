import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminSpacesClient } from "@/components/admin/AdminSpacesClient";

export default async function AdminSpacesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-2xl">
      <h1 className="type-page">
        Spaces
      </h1>
      <p className="text-sm text-base-content/60 mt-1 mb-2">
        Brands and departments people can open.
      </p>
      <AdminSpacesClient />
    </div>
  );
}
