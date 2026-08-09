import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export default async function AdminUsersPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="max-w-4xl mx-auto w-full">
      <h1 className="type-page">
        Users
      </h1>
      <p className="type-caption mt-1 mb-2">
        Edit people, place roles, admin access, or delete accounts permanently.
        Deactivated people stay in the list, dimmed.
      </p>
      <AdminUsersClient />
    </div>
  );
}
