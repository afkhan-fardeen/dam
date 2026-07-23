import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminTagsClient } from "@/components/admin/AdminTagsClient";

export default async function AdminTagsPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-3xl">
      <h1 className="type-page">
        Tags
      </h1>
      <p className="text-sm text-base-content/60 mt-1 mb-2">
        Rename, merge, or delete tags used across files.
      </p>
      <AdminTagsClient />
    </div>
  );
}
