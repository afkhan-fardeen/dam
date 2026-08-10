import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export default async function AdminUsersPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">
        Users
      </h1>
      <p className="admin-page-caption">
        Edit people, space roles, admin access, or delete accounts permanently.
        Deactivated people stay in the list, dimmed.
      </p>
      <AdminUsersClient />
    </div>
  );
}
