import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const typeId = searchParams.get("type");
  const status = searchParams.get("status") ?? "active";

  let query = supabase
    .from("entities")
    .select(
      "id,type_id,name,aliases,description,status,merged_into_id,roles,created_by,created_at,updated_at, entity_types ( id, name, label )",
    )
    .order("name")
    .limit(200);

  if (status !== "all") query = query.eq("status", status);
  if (typeId) query = query.eq("type_id", typeId);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((e) => e.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: links } = await supabase
      .from("asset_entities")
      .select("entity_id")
      .in("entity_id", ids);
    for (const link of links ?? []) {
      const eid = link.entity_id as string;
      counts.set(eid, (counts.get(eid) ?? 0) + 1);
    }
  }

  const entities = (data ?? []).map((e) => {
    const row = e as typeof e & {
      entity_types?: { id: string; name: string; label: string } | null;
    };
    return {
      ...row,
      entity_type: row.entity_types ?? null,
      document_count: counts.get(row.id) ?? 0,
      alias_count: (row.aliases as string[] | null)?.length ?? 0,
    };
  });

  return NextResponse.json({ entities });
}
