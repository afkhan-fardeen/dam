"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EntityChip, entityTypeColor } from "@/components/EntityChip";
import type { Entity, EntityType } from "@/lib/types";

export type PickedEntity = Entity & { relation_label?: string | null };

type EntityPickerProps = {
  selected: PickedEntity[];
  onChange: (next: PickedEntity[]) => void;
  disabled?: boolean;
};

export function EntityPicker({
  selected,
  onChange,
  disabled,
}: EntityPickerProps) {
  const [types, setTypes] = useState<EntityType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Entity[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/entity-types")
      .then((r) => r.json())
      .then((j) => {
        if (j.types) {
          setTypes(j.types as EntityType[]);
          if (!typeId && j.types[0]) setTypeId(j.types[0].id);
        }
      })
      .catch(() => null);
  }, [typeId]);

  const search = useCallback(async (q: string, tid: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const params = new URLSearchParams({ q: q.trim() });
    if (tid) params.set("type", tid);
    const res = await fetch(`/api/entities?${params}`);
    const json = await res.json();
    if (res.ok) setResults(json.entities as Entity[]);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => void search(query, typeId), 180);
    return () => window.clearTimeout(handle);
  }, [query, typeId, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function addEntity(entity: Entity) {
    if (selected.some((s) => s.id === entity.id)) return;
    onChange([...selected, entity]);
    setQuery("");
    setResults([]);
    setOpen(false);
    setDuplicates(null);
    setError(null);
  }

  function removeEntity(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function createNew(force = false) {
    const name = query.trim();
    if (!name || !typeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type_id: typeId, name, force }),
      });
      const json = await res.json();
      if (res.status === 409 && json.suggested_duplicates) {
        setDuplicates(json.suggested_duplicates as Entity[]);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not create entity");
      addEntity(json.entity as Entity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1" ref={wrapRef}>
      <span className="type-micro opacity-50">Relate to…</span>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => (
            <EntityChip
              key={e.id}
              entity={e}
              href={null}
              onRemove={disabled ? undefined : () => removeEntity(e.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <select
          className="select select-bordered select-sm w-28 shrink-0 bg-white/70 border-[var(--line)]"
          value={typeId}
          disabled={disabled}
          onChange={(e) => setTypeId(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <input
            value={query}
            disabled={disabled || busy}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setDuplicates(null);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search or create"
            className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
          />
          {open && (query.trim() || results.length > 0) ? (
            <div
              className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto glass-content !bg-[var(--content-glass)]"
              style={{ borderRadius: 14 }}
            >
              {results.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="card-row w-full text-left"
                  onClick={() => addEntity(e)}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: entityTypeColor(e.entity_type?.name),
                    }}
                  />
                  <span className="truncate flex-1">{e.name}</span>
                  <span className="type-caption">
                    {e.entity_type?.label}
                  </span>
                </button>
              ))}
              {query.trim() ? (
                <button
                  type="button"
                  className="card-row w-full text-left text-[var(--accent)] border-t border-[var(--line)]"
                  disabled={busy}
                  onClick={() => void createNew(false)}
                >
                  Create &ldquo;{query.trim()}&rdquo;
                  {types.find((t) => t.id === typeId)
                    ? ` as ${types.find((t) => t.id === typeId)?.label}`
                    : ""}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {duplicates && duplicates.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm flex flex-col gap-1">
          <p className="opacity-80">Did you mean one of these?</p>
          <div className="flex flex-wrap gap-1">
            {duplicates.map((d) => (
              <button
                key={d.id}
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => addEntity(d)}
              >
                {d.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs self-start"
            onClick={() => void createNew(true)}
          >
            Create anyway
          </button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
