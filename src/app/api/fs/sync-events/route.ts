import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { basenamePath, parentRelativePath } from "@/lib/fsNodes";

export const runtime = "nodejs";

type SyncEvent = {
  type: string;
  relative_path: string;
  node_type?: "file" | "folder";
  name?: string;
  size_bytes?: number | null;
  content_hash?: string | null;
  mime_type?: string | null;
  has_thumbnail?: boolean;
  user_id?: string | null;
  nodes?: SyncEvent[];
};

async function ensureAncestors(
  admin: ReturnType<typeof getSupabaseAdmin>,
  relativePath: string,
): Promise<string | null> {
  const parts = relativePath.split("/").filter(Boolean);
  let parentId: string | null = null;
  let built = "";
  for (let i = 0; i < parts.length - 1; i++) {
    built = built ? `${built}/${parts[i]}` : parts[i];
    const { data: existing } = await admin
      .from("fs_nodes")
      .select("id")
      .eq("relative_path", built)
      .maybeSingle();
    if (existing?.id) {
      parentId = existing.id as string;
      continue;
    }
    const currentParent = parentId;
    const { data, error } = await admin
      .from("fs_nodes")
      .insert({
        parent_id: currentParent,
        node_type: "folder",
        name: parts[i],
        relative_path: built,
        is_deleted: false,
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    parentId = data!.id as string;
    // Explorer-created folders: no creator grant (admin-only until shared)
  }
  return parentId;
}

async function upsertPresent(
  admin: ReturnType<typeof getSupabaseAdmin>,
  ev: SyncEvent,
) {
  const relative = (ev.relative_path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!relative) return;

  const name = ev.name || basenamePath(relative);
  const nodeType = ev.node_type || "file";
  const parentId = await ensureAncestors(admin, relative);

  const { data: existing } = await admin
    .from("fs_nodes")
    .select("id,is_deleted")
    .eq("relative_path", relative)
    .maybeSingle();

  const row = {
    parent_id: parentId,
    node_type: nodeType,
    name,
    relative_path: relative,
    size_bytes: nodeType === "file" ? (ev.size_bytes ?? null) : null,
    mime_type: ev.mime_type ?? null,
    content_hash: ev.content_hash ?? null,
    has_thumbnail: Boolean(ev.has_thumbnail),
    uploaded_by: ev.user_id || null,
    is_deleted: false,
    deleted_at: null,
    last_synced_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await admin.from("fs_nodes").update(row).eq("id", existing.id);
  } else {
    if (ev.content_hash && ev.size_bytes != null) {
      const { data: candidates } = await admin
        .from("fs_nodes")
        .select("id")
        .eq("content_hash", ev.content_hash)
        .eq("size_bytes", ev.size_bytes)
        .eq("is_deleted", true)
        .limit(1);
      const hit = candidates?.[0];
      if (hit?.id) {
        await admin
          .from("fs_nodes")
          .update({
            ...row,
            parent_id: parentId,
            relative_path: relative,
            name,
          })
          .eq("id", hit.id);
        return;
      }
    }
    await admin.from("fs_nodes").insert(row);
  }
}

async function markMissing(
  admin: ReturnType<typeof getSupabaseAdmin>,
  relative: string,
) {
  const path = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) return;
  await admin
    .from("fs_nodes")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq("relative_path", path)
    .eq("is_deleted", false);
}

export async function POST(request: Request) {
  const key = request.headers.get("x-sync-service-key") || "";
  const expected = process.env.SYNC_SERVICE_KEY || "";
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    events?: SyncEvent[];
  };
  const events = body.events ?? [];
  const admin = getSupabaseAdmin();

  for (const ev of events) {
    try {
      if (ev.type === "sweep" && Array.isArray(ev.nodes)) {
        const present = new Set(
          ev.nodes.map((n) => n.relative_path.replace(/\\/g, "/")),
        );
        for (const n of ev.nodes) {
          await upsertPresent(admin, { ...n, type: "present" });
        }
        const { data: live } = await admin
          .from("fs_nodes")
          .select("id,relative_path")
          .eq("is_deleted", false);
        for (const row of live ?? []) {
          const rp = row.relative_path as string;
          if (!present.has(rp)) {
            await admin
              .from("fs_nodes")
              .update({
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }
        }
        continue;
      }

      if (
        ev.type === "add" ||
        ev.type === "addDir" ||
        ev.type === "change" ||
        ev.type === "present"
      ) {
        await upsertPresent(admin, ev);
      } else if (ev.type === "unlink" || ev.type === "unlinkDir") {
        await markMissing(admin, ev.relative_path);
      }
    } catch (err) {
      console.error("[sync-events]", ev.type, ev.relative_path, err);
    }
  }

  return NextResponse.json({ ok: true, processed: events.length });
}

void parentRelativePath;
