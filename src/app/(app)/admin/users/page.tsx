import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export default async function AdminUsersPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-3xl">
      <h1 className="type-page">
        Users
      </h1>
      <p className="text-sm text-base-content/60 mt-1 mb-2">
        Accounts and space roles. Deactivated people stay in the list, dimmed.
      </p>
      <AdminUsersClient />
    </div>
  );
}
