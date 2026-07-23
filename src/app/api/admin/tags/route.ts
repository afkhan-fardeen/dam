import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: tags, error } = await supabase
    .from("tags")
    .select("id,name,created_at")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: links } = await supabase.from("asset_tags").select("tag_id");
  const counts = new Map<string, number>();
  for (const row of links ?? []) {
    counts.set(row.tag_id, (counts.get(row.tag_id) || 0) + 1);
  }

  return NextResponse.json({
    tags: (tags ?? []).map((t) => ({
      ...t,
      count: counts.get(t.id) || 0,
    })),
  });
}

export async function PATCH(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    merge_into_id?: string;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing tag id" }, { status: 400 });
  }

  // Merge: move all asset_tags from id → merge_into_id, then delete id
  if (body.merge_into_id) {
    if (body.merge_into_id === body.id) {
      return NextResponse.json({ error: "Cannot merge a tag into itself" }, { status: 400 });
    }
    const { data: links } = await supabase
      .from("asset_tags")
      .select("asset_id")
      .eq("tag_id", body.id);

    for (const link of links ?? []) {
      await supabase.from("asset_tags").upsert(
        { asset_id: link.asset_id, tag_id: body.merge_into_id },
        { onConflict: "asset_id,tag_id" },
      );
    }
    await supabase.from("asset_tags").delete().eq("tag_id", body.id);
    await supabase.from("tags").delete().eq("id", body.id);

    await logActivity(
      {
        user_id: user.id,
        action: "merge_tag",
        target_type: "tag",
        target_id: body.merge_into_id,
        details: { from_id: body.id },
      },
      supabase,
    );
    return NextResponse.json({ ok: true });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", body.id)
    .select("id,name,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "rename_tag",
      target_type: "tag",
      target_id: body.id,
      details: { name },
    },
    supabase,
  );

  return NextResponse.json({ tag: data });
}

export async function DELETE(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing tag id" }, { status: 400 });
  }

  await supabase.from("asset_tags").delete().eq("tag_id", id);
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "delete_tag",
      target_type: "tag",
      target_id: id,
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
