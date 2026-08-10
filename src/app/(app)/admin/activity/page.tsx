import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";

export default async function AdminActivityPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">
        Activity
      </h1>
      <p className="admin-page-caption">
        Recent actions across the library.
      </p>
      <AdminActivityClient />
    </div>
  );
}
