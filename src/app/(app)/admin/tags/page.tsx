import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminTagsClient } from "@/components/admin/AdminTagsClient";

export default async function AdminTagsPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="max-w-4xl mx-auto w-full">
      <h1 className="type-page">
        Tags
      </h1>
      <p className="type-caption mt-1 mb-2">
        Rename, merge, or delete tags used across files.
      </p>
      <AdminTagsClient />
    </div>
  );
}
