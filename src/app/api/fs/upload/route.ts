import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  FS_NODE_COLS,
  grantCreatorEdit,
  joinRelative,
  resolveParentFolder,
  setFsNodeTags,
} from "@/lib/fsNodes";
import {
  getFsUploadBase,
  signFsUploadPutToken,
  signFsUploadToken,
} from "@/lib/fsClient";
import { buildFileApiUrl } from "@/lib/fileApiAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    parent_id?: string | null;
    name?: string;
    size?: number;
    mime_type?: string;
    chunk_size?: number;
  };

  const name = body.name?.trim();
  const size = Number(body.size || 0);
  if (!name || !size) {
    return NextResponse.json(
      { error: "name and size required" },
      { status: 400 },
    );
  }

  let parentId: string | null;
  let parentPath: string;
  try {
    ({ parentId, parentPath } = await resolveParentFolder(
      supabase,
      body.parent_id,
    ));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parent not found" },
      { status: 404 },
    );
  }

  if (parentId) {
    // Open drive: any signed-in user may upload into any folder
  }

  const targetPath = parentPath ? joinRelative(parentPath, name) : name;
  const postTok = signFsUploadToken();
  const putTok = signFsUploadPutToken();
  const base = getFsUploadBase();

  const initRes = await fetch(buildFileApiUrl("/fs/upload/init", postTok.token), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": postTok.token,
    },
    body: JSON.stringify({
      path: targetPath,
      size,
      user_id: user.id,
      chunk_size: body.chunk_size || 8 * 1024 * 1024,
    }),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    return NextResponse.json(
      { error: initJson.error || "Could not start upload" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    session_id: initJson.session_id,
    offset: initJson.offset ?? 0,
    chunk_size: initJson.chunk_size || 8 * 1024 * 1024,
    target_path: targetPath,
    parent_id: parentId,
    upload: {
      base,
      post_token: postTok.token,
      put_token: putTok.token,
      init_url: `${base}/fs/upload/init`,
      chunk_url: `${base}/fs/upload/chunk`,
      complete_url: `${base}/fs/upload/complete`,
    },
  });
}

export async function PUT(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    parent_id?: string | null;
    session_id?: string;
    name?: string;
    mime_type?: string;
    tags?: string[];
    description?: string | null;
    created_by?: string | null;
  };

  if (!body.session_id || !body.name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const postTok = signFsUploadToken();
  const base = getFsUploadBase();
  const completeRes = await fetch(`${base}/fs/upload/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": postTok.token,
    },
    body: JSON.stringify({
      session_id: body.session_id,
      mime_type: body.mime_type || null,
      user_id: user.id,
    }),
  });
  const completeJson = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    return NextResponse.json(
      { error: completeJson.error || "Complete failed" },
      { status: 400 },
    );
  }

  const relativePath = completeJson.relative_path as string;
  let parentId = body.parent_id ?? null;
  if (!parentId) {
    try {
      const resolved = await resolveParentFolder(supabase, null);
      parentId = resolved.parentId;
      const parentPath = relativePath.includes("/")
        ? relativePath.slice(0, relativePath.lastIndexOf("/"))
        : null;
      if (parentPath) {
        const { data: parent } = await supabase
          .from("fs_nodes")
          .select("id")
          .eq("relative_path", parentPath)
          .maybeSingle();
        parentId = parent?.id ?? null;
      }
    } catch {
      /* keep null */
    }
  }

  const { data: node, error } = await supabase
    .from("fs_nodes")
    .upsert(
      {
        parent_id: parentId,
        node_type: "file",
        name: body.name,
        relative_path: relativePath,
        size_bytes: completeJson.size_bytes ?? null,
        mime_type: completeJson.mime_type || body.mime_type || null,
        content_hash: completeJson.content_hash ?? null,
        has_thumbnail: Boolean(completeJson.has_thumbnail),
        description: body.description ?? null,
        created_by: body.created_by ?? null,
        uploaded_by: user.id,
        is_deleted: false,
      },
      { onConflict: "relative_path" },
    )
    .select(FS_NODE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Open drive: any signed-in user may complete uploads at root or in folders.

  if (Array.isArray(body.tags) && body.tags.length) {
    await setFsNodeTags(supabase, node.id, body.tags.map(String), true);
  }

  void grantCreatorEdit;

  return NextResponse.json({ node }, { status: 201 });
}
