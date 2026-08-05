import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";

export default async function AdminActivityPage() {
  const { ok } = await requireAdmin();
  if (!ok) redirect("/");

  return (
    <div className="max-w-4xl mx-auto w-full">
      <h1 className="type-page">
        Activity
      </h1>
      <p className="type-caption mt-1 mb-2">
        Recent actions across the library.
      </p>
      <AdminActivityClient />
    </div>
  );
}
