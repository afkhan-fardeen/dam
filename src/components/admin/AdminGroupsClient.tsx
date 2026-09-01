"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AccessGroup, Profile } from "@/lib/types";

export function AdminGroupsClient() {
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<
    { user_id: string; profiles: Profile | null }[]
  >([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/admin/groups");
    const json = await res.json();
    if (res.ok) setGroups(json.groups ?? []);
  }, []);

  useEffect(() => {
    void loadGroups();
    void (async () => {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (res.ok) setUsers((json.users ?? json.profiles ?? []) as Profile[]);
    })();
  }, [loadGroups]);

  useEffect(() => {
    if (!selected) {
      setMembers([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/groups/${selected}`);
      const json = await res.json();
      if (res.ok) setMembers(json.members ?? []);
    })();
  }, [selected]);

  async function createGroup() {
    setError(null);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not create");
      return;
    }
    setName("");
    await loadGroups();
    setSelected(json.group.id);
  }

  async function addMember() {
    if (!selected || !addUserId) return;
    const res = await fetch(`/api/admin/groups/${selected}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: addUserId }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error || "Could not add");
      return;
    }
    setAddUserId("");
    const r = await fetch(`/api/admin/groups/${selected}`);
    const j = await r.json();
    if (r.ok) setMembers(j.members ?? []);
  }

  async function removeMember(userId: string) {
    if (!selected) return;
    await fetch(
      `/api/admin/groups/${selected}/members?user_id=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      <div>
        <h1 className="text-xl font-semibold">Groups</h1>
        <p className="text-sm text-base-content/60">
          Named groups for folder permissions (Everyone is seeded).
        </p>
      </div>
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-box border border-base-300/60 p-4">
          <h2 className="font-semibold">Groups</h2>
          <ul className="mt-3 space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm w-full justify-start ${selected === g.id ? "btn-active" : ""}`}
                  onClick={() => setSelected(g.id)}
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="New group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button variant="primary" onClick={() => void createGroup()}>
              Add
            </Button>
          </div>
        </div>
        <div className="rounded-box border border-base-300/60 p-4">
          <h2 className="font-semibold">Members</h2>
          {!selected ? (
            <p className="mt-3 text-sm text-base-content/50">Select a group</p>
          ) : (
            <>
              <ul className="mt-3 space-y-1 text-sm">
                {members.map((m) => (
                  <li key={m.user_id} className="flex justify-between gap-2">
                    <span>
                      {(m.profiles as Profile | null)?.full_name ||
                        (m.profiles as Profile | null)?.email ||
                        m.user_id.slice(0, 8)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => void removeMember(m.user_id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <select
                  className="select select-bordered select-sm flex-1"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">Add user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={() => void addMember()}>
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
