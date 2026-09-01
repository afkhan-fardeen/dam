import { redirect } from "next/navigation";
import { getUserSpaces } from "@/lib/auth";
import { AdminGroupsClient } from "@/components/admin/AdminGroupsClient";

export default async function AdminGroupsPage() {
  const { profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");
  if (!profile.is_admin) redirect("/");
  return <AdminGroupsClient />;
}
