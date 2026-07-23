import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";

export default async function AdminActivityPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="p-5 sm:p-8 max-w-4xl">
      <h1 className="type-page">
        Activity
      </h1>
      <p className="text-sm text-base-content/60 mt-1 mb-2">
        Recent actions across the library.
      </p>
      <AdminActivityClient />
    </div>
  );
}
