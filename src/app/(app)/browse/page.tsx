import { getUserSpaces } from "@/lib/auth";
import { BrowseClient } from "@/components/BrowseClient";

export default async function BrowsePage() {
  const { spaces, profile } = await getUserSpaces();
  if (!profile) {
    return (
      <div className="p-5 text-sm text-[var(--ink-soft)]">
        Portal is not configured.
      </div>
    );
  }

  const active = spaces.filter((s) => s.status !== "archived");

  return <BrowseClient spaces={active} />;
}
