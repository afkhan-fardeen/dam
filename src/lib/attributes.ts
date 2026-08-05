import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttributeDef, AssetAttributeValue } from "@/lib/types";

export async function getAttributeDefs(
  supabase: SupabaseClient,
  options?: { spaceKind?: string | null; includeArchived?: boolean },
): Promise<AttributeDef[]> {
  let query = supabase
    .from("attribute_defs")
    .select(
      "id,name,label,data_type,dropdown_options,applicable_space_kind,searchable,filterable,status,created_at",
    )
    .order("label");

  if (!options?.includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) throw error;

  let defs = (data ?? []) as AttributeDef[];
  if (options?.spaceKind) {
    defs = defs.filter(
      (d) =>
        !d.applicable_space_kind ||
        d.applicable_space_kind === options.spaceKind,
    );
  }
  return defs;
}

export function normalizeAttributeValue(
  dataType: string,
  raw: unknown,
): {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
} {
  const empty = {
    value_text: null as string | null,
    value_number: null as number | null,
    value_boolean: null as boolean | null,
    value_date: null as string | null,
  };

  if (raw === null || raw === undefined || raw === "") return empty;

  switch (dataType) {
    case "number":
    case "currency": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (Number.isNaN(n)) throw new Error("Invalid number");
      return { ...empty, value_number: n };
    }
    case "boolean":
      return {
        ...empty,
        value_boolean:
          raw === true || raw === "true" || raw === "1" || raw === "yes",
      };
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date");
      return { ...empty, value_date: s };
    }
    case "dropdown":
    case "text":
    default:
      return { ...empty, value_text: String(raw).trim() };
  }
}

export function displayAttributeValue(
  def: AttributeDef,
  row: AssetAttributeValue,
): string {
  switch (def.data_type) {
    case "number":
    case "currency":
      return row.value_number != null ? String(row.value_number) : "";
    case "boolean":
      return row.value_boolean == null
        ? ""
        : row.value_boolean
          ? "Yes"
          : "No";
    case "date":
      return row.value_date ?? "";
    default:
      return row.value_text ?? "";
  }
}

export async function getAssetAttributes(
  supabase: SupabaseClient,
  assetId: string,
): Promise<(AssetAttributeValue & { attribute_def: AttributeDef })[]> {
  const { data, error } = await supabase
    .from("asset_attribute_values")
    .select(
      `asset_id,attribute_def_id,value_text,value_number,value_boolean,value_date,
       attribute_defs ( id,name,label,data_type,dropdown_options,applicable_space_kind,searchable,filterable,status,created_at )`,
    )
    .eq("asset_id", assetId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const raw = row.attribute_defs as unknown;
      const def = (Array.isArray(raw) ? raw[0] : raw) as AttributeDef | null;
      if (!def) return null;
      return {
        asset_id: row.asset_id as string,
        attribute_def_id: row.attribute_def_id as string,
        value_text: row.value_text as string | null,
        value_number: row.value_number as number | null,
        value_boolean: row.value_boolean as boolean | null,
        value_date: row.value_date as string | null,
        attribute_def: def,
      };
    })
    .filter(Boolean) as (AssetAttributeValue & { attribute_def: AttributeDef })[];
}

export async function upsertAssetAttributes(
  supabase: SupabaseClient,
  assetId: string,
  values: { attribute_def_id: string; value: unknown }[],
  defs: AttributeDef[],
): Promise<void> {
  const defMap = new Map(defs.map((d) => [d.id, d]));

  for (const item of values) {
    const def = defMap.get(item.attribute_def_id);
    if (!def) throw new Error("Unknown attribute definition");

    if (item.value === null || item.value === undefined || item.value === "") {
      await supabase
        .from("asset_attribute_values")
        .delete()
        .eq("asset_id", assetId)
        .eq("attribute_def_id", item.attribute_def_id);
      continue;
    }

    const normalized = normalizeAttributeValue(def.data_type, item.value);
    const { error } = await supabase.from("asset_attribute_values").upsert(
      {
        asset_id: assetId,
        attribute_def_id: item.attribute_def_id,
        ...normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asset_id,attribute_def_id" },
    );
    if (error) throw error;
  }
}
