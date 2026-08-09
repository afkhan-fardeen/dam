import { redirect } from "next/navigation";
import { getUserSpaces } from "@/lib/auth";
import { BrowseClient } from "@/components/BrowseClient";

export default async function BrowsePage() {
  const { spaces, profile, user } = await getUserSpaces();
  if (!user || !profile) redirect("/login");

  const active = spaces.filter((s) => s.status !== "archived");

  return <BrowseClient spaces={active} />;
}
