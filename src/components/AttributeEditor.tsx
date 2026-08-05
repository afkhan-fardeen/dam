"use client";

import { useEffect, useMemo, useState } from "react";
import { displayAttributeValue } from "@/lib/attributes";
import type { AttributeDef, AssetAttributeValue } from "@/lib/types";

function display(
  def: AttributeDef,
  row: AssetAttributeValue | undefined,
): string {
  if (!row) return "";
  return displayAttributeValue(def, row);
}

type AttributeEditorProps = {
  assetId: string;
  canEdit: boolean;
  spaceKind?: string | null;
};

/**
 * Label-above-value rows matching AssetDetail metadata — not a bordered table.
 */
export function AttributeEditor({
  assetId,
  canEdit,
  spaceKind,
}: AttributeEditorProps) {
  const [defs, setDefs] = useState<AttributeDef[]>([]);
  const [values, setValues] = useState<
    Record<string, AssetAttributeValue & { attribute_def?: AttributeDef }>
  >({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [extraDefId, setExtraDefId] = useState("");
  const [manualIds, setManualIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (spaceKind) params.set("space_kind", spaceKind);
        const [defsRes, valsRes] = await Promise.all([
          fetch(`/api/attribute-defs?${params}`),
          fetch(`/api/assets/${assetId}/attributes`),
        ]);
        const defsJson = await defsRes.json();
        const valsJson = await valsRes.json();
        if (cancelled) return;
        const nextDefs = (defsJson.defs ??
          valsJson.defs ??
          []) as AttributeDef[];
        setDefs(nextDefs);
        const map: typeof values = {};
        const d: Record<string, string> = {};
        for (const v of (valsJson.values ?? []) as (AssetAttributeValue & {
          attribute_def: AttributeDef;
        })[]) {
          map[v.attribute_def_id] = v;
          d[v.attribute_def_id] = display(v.attribute_def, v);
        }
        setValues(map);
        setDraft(d);
        setDirty(false);
        setManualIds([]);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, spaceKind]);

  const populatedIds = useMemo(() => new Set(Object.keys(values)), [values]);

  const shown = useMemo(() => {
    const suggested = defs.filter(
      (d) =>
        !d.applicable_space_kind ||
        !spaceKind ||
        d.applicable_space_kind === spaceKind,
    );
    const extras = defs.filter(
      (d) =>
        (populatedIds.has(d.id) || manualIds.includes(d.id)) &&
        !suggested.some((s) => s.id === d.id),
    );
    return [...suggested, ...extras];
  }, [defs, spaceKind, populatedIds, manualIds]);

  const unused = defs.filter((d) => !shown.some((s) => s.id === d.id));

  function setField(defId: string, value: string) {
    setDraft((prev) => ({ ...prev, [defId]: value }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const ids = new Set([
        ...shown.map((d) => d.id),
        ...Object.keys(draft),
      ]);
      const payload = [...ids].map((id) => ({
        attribute_def_id: id,
        value: draft[id] ?? "",
      }));

      const res = await fetch(`/api/assets/${assetId}/attributes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save attributes.");
      const map: typeof values = {};
      const d: Record<string, string> = {};
      for (const v of (json.values ?? []) as (AssetAttributeValue & {
        attribute_def: AttributeDef;
      })[]) {
        map[v.attribute_def_id] = v;
        d[v.attribute_def_id] = display(v.attribute_def, v);
      }
      setValues(map);
      setDraft(d);
      setDirty(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. Check the values and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function renderInput(def: AttributeDef) {
    const val = draft[def.id] ?? "";
    if (!canEdit) {
      return (
        <p className="type-body text-base-content">
          {val ? (
            def.data_type === "currency" ? (
              <>{val}</>
            ) : (
              val
            )
          ) : (
            <span className="opacity-60">—</span>
          )}
        </p>
      );
    }

    switch (def.data_type) {
      case "boolean":
        return (
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={val === "true" || val === "Yes" || val === "1"}
            onChange={(e) =>
              setField(def.id, e.target.checked ? "true" : "false")
            }
          />
        );
      case "date":
        return (
          <input
            type="date"
            className="input input-bordered input-sm w-full"
            value={val}
            onChange={(e) => setField(def.id, e.target.value)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            step="any"
            className="input input-bordered input-sm w-full"
            value={val}
            onChange={(e) => setField(def.id, e.target.value)}
          />
        );
      case "currency":
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="any"
              className="input input-bordered input-sm flex-1"
              value={val}
              onChange={(e) => setField(def.id, e.target.value)}
            />
            <span className="type-caption opacity-50 shrink-0">amount</span>
          </div>
        );
      case "dropdown":
        return (
          <select
            className="select select-bordered select-sm w-full"
            value={val}
            onChange={(e) => setField(def.id, e.target.value)}
          >
            <option value="">—</option>
            {(def.dropdown_options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      default:
        return (
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            value={val}
            onChange={(e) => setField(def.id, e.target.value)}
          />
        );
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="type-micro opacity-50">Attributes</p>

      {shown.length === 0 && !canEdit ? (
        <p className="type-body opacity-60">
          No attributes on this file yet. An editor can add invoice numbers,
          dates, and other typed fields here.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {shown.map((def) => (
          <div key={def.id} className="flex flex-col gap-1">
            <p className="type-micro opacity-50">{def.label}</p>
            {renderInput(def)}
          </div>
        ))}
      </div>

      {canEdit && unused.length > 0 ? (
        <div className="flex gap-1.5 items-end">
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="type-micro opacity-50">Add attribute</span>
            <select
              className="select select-bordered select-sm w-full"
              value={extraDefId}
              onChange={(e) => setExtraDefId(e.target.value)}
            >
              <option value="">Choose…</option>
              {unused.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!extraDefId}
            onClick={() => {
              if (!extraDefId) return;
              setManualIds((prev) =>
                prev.includes(extraDefId) ? prev : [...prev, extraDefId],
              );
              setDraft((prev) => ({
                ...prev,
                [extraDefId]: prev[extraDefId] ?? "",
              }));
              setExtraDefId("");
              setDirty(true);
            }}
          >
            Add
          </button>
        </div>
      ) : null}

      {canEdit && dirty ? (
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save attributes"}
        </button>
      ) : null}
      {error ? <p className="type-caption text-error">{error}</p> : null}
    </section>
  );
}
