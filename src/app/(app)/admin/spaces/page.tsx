import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminSpacesClient } from "@/components/admin/AdminSpacesClient";

export default async function AdminSpacesPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="max-w-4xl mx-auto w-full">
      <h1 className="type-page">
        Spaces
      </h1>
      <p className="type-caption mt-1 mb-2">
        Brands and departments people can open.
      </p>
      <AdminSpacesClient />
    </div>
  );
}
