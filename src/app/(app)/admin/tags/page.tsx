import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminTagsClient } from "@/components/admin/AdminTagsClient";

export default async function AdminTagsPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">
        Tags
      </h1>
      <p className="admin-page-caption">
        Rename, merge, or delete tags used across files.
      </p>
      <AdminTagsClient />
    </div>
  );
}
