import { redirect } from "next/navigation";

/** Spaces retired — redirect to flat drive. */
export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceSlug: string }>;
}) {
  await params;
  redirect("/");
}
