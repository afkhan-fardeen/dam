"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { AttributeDef } from "@/lib/types";

export function AdminAttributesClient() {
  const [defs, setDefs] = useState<AttributeDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState("text");
  const [options, setOptions] = useState("");
  const [spaceKind, setSpaceKind] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<AttributeDef | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/attribute-defs");
    const json = await res.json();
    if (res.ok) setDefs(json.defs as AttributeDef[]);
    else setError(json.error || "Could not load attributes.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDef(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribute-defs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || label,
          label,
          data_type: dataType,
          dropdown_options:
            dataType === "dropdown"
              ? options
                  .split(/[,;\n]/)
                  .map((o) => o.trim())
                  .filter(Boolean)
              : null,
          applicable_space_kind: spaceKind || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create.");
      setShowCreate(false);
      setLabel("");
      setName("");
      setOptions("");
      setSpaceKind("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attribute-defs/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not archive.");
      setArchiveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-content p-5 sm:p-6 flex flex-col gap-4">
      <AdminTabs />

      <div className="flex justify-end px-2">
        <button
          type="button"
          className="btn-glass-primary px-4 py-2 text-[13px] font-medium"
          onClick={() => setShowCreate(true)}
        >
          New attribute
        </button>
      </div>

      {error ? <p className="type-body text-[#ff3b30] px-2">{error}</p> : null}

      <div className="flex flex-col gap-0.5">
        {defs.length === 0 ? (
          <p className="px-2 py-6 type-body text-[var(--ink-soft)] max-w-xl">
            Attribute definitions describe typed fields on documents — invoice
            numbers, AWB codes, scheduled dates. Create one to make it available
            in every file&apos;s Attributes panel.
          </p>
        ) : (
          defs.map((d) => (
            <div
              key={d.id}
              className="px-2 py-3 hover:bg-white/45 flex flex-wrap items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="type-label truncate">{d.label}</p>
                <p className="type-caption text-[var(--ink-soft)]">
                  {d.name} · {d.data_type}
                  {d.applicable_space_kind
                    ? ` · ${d.applicable_space_kind}`
                    : " · any space"}
                  {d.status !== "active" ? ` · ${d.status}` : ""}
                </p>
              </div>
              {d.status === "active" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs ml-auto"
                  disabled={busy}
                  onClick={() => setArchiveTarget(d)}
                >
                  Archive
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {showCreate ? (
        <AdminModal
          title="New attribute"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-attr-form"
                className="btn btn-primary"
                disabled={busy}
              >
                Create
              </button>
            </>
          }
        >
          <form
            id="create-attr-form"
            onSubmit={createDef}
            className="flex flex-col gap-3"
          >
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Label
              </legend>
              <input
                required
                className="input input-bordered w-full"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Key (optional)
              </legend>
              <input
                className="input input-bordered w-full"
                placeholder="Auto from label"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Type
              </legend>
              <select
                className="select select-bordered w-full"
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="date">Date</option>
                <option value="boolean">Boolean</option>
                <option value="dropdown">Dropdown</option>
              </select>
            </fieldset>
            {dataType === "dropdown" ? (
              <fieldset className="fieldset w-full">
                <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                  Options (comma-separated)
                </legend>
                <input
                  className="input input-bordered w-full"
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                />
              </fieldset>
            ) : null}
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Space kind
              </legend>
              <select
                className="select select-bordered w-full"
                value={spaceKind}
                onChange={(e) => setSpaceKind(e.target.value)}
              >
                <option value="">Any</option>
                <option value="brand">Brand</option>
                <option value="department">Department</option>
              </select>
            </fieldset>
          </form>
        </AdminModal>
      ) : null}

      {archiveTarget ? (
        <ConfirmModal
          title="Archive attribute?"
          message={`Archive “${archiveTarget.label}”? It will hide from new edits; existing values on files stay.`}
          confirmLabel="Archive"
          danger
          busy={busy}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      ) : null}
    </div>
  );
}
