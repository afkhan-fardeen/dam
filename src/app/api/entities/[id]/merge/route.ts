import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";
import { mergeEntities } from "@/lib/entities";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: sourceId } = await context.params;
  const body = (await request.json()) as { target_id?: string };
  if (!body.target_id) {
    return NextResponse.json({ error: "target_id is required" }, { status: 400 });
  }

  try {
    await mergeEntities(supabase, sourceId, body.target_id);
    await logActivity(
      {
        user_id: user.id,
        action: "merge_entity",
        target_type: "entity",
        target_id: body.target_id,
        details: { source_id: sourceId, target_id: body.target_id },
      },
      supabase,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
