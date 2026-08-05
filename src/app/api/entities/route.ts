import { NextResponse } from "next/server";
import { requireUser, logActivity } from "@/lib/auth";
import {
  createEntity,
  listEntityTypes,
  searchEntities,
  userCanEditAnySpace,
} from "@/lib/entities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const typeId = searchParams.get("type");
  const status = searchParams.get("status") ?? "active";

  try {
    const entities = await searchEntities(supabase, {
      q,
      typeId,
      status,
    });

    const types = await listEntityTypes(supabase);
    const typeMap = new Map(types.map((t) => [t.id, t]));

    return NextResponse.json({
      entities: entities.map((e) => ({
        ...e,
        entity_type: typeMap.get(e.type_id) ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const canCreate = await userCanEditAnySpace(
    supabase,
    user.id,
    profile.is_admin,
  );
  if (!canCreate) {
    return NextResponse.json(
      { error: "Editors can create entities" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    type_id?: string;
    name?: string;
    aliases?: string[];
    description?: string | null;
    roles?: string[];
    force?: boolean;
  };

  if (!body.type_id || !body.name?.trim()) {
    return NextResponse.json(
      { error: "type_id and name are required" },
      { status: 400 },
    );
  }

  try {
    // Pre-check duplicates unless force
    if (!body.force) {
      const similar = await searchEntities(supabase, {
        q: body.name.trim(),
        typeId: body.type_id,
        limit: 5,
      });
      const close = similar.filter(
        (e) =>
          e.name.toLowerCase() === body.name!.trim().toLowerCase() ||
          e.aliases?.some(
            (a) => a.toLowerCase() === body.name!.trim().toLowerCase(),
          ),
      );
      if (close.length > 0) {
        return NextResponse.json(
          {
            error: "Similar entity already exists",
            code: "DUPLICATE_SUGGESTION",
            suggested_duplicates: close,
          },
          { status: 409 },
        );
      }
    }

    const { entity, suggested_duplicates } = await createEntity(supabase, {
      type_id: body.type_id,
      name: body.name,
      aliases: body.aliases,
      description: body.description,
      roles: body.roles,
      created_by: user.id,
    });

    await logActivity(
      {
        user_id: user.id,
        action: "create_entity",
        target_type: "entity",
        target_id: entity.id,
        details: { name: entity.name, type_id: entity.type_id },
      },
      supabase,
    );

    return NextResponse.json(
      { entity, suggested_duplicates },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
