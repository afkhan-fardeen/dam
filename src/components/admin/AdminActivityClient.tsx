"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityLog, Space, Profile } from "@/lib/types";
import { AdminTabs } from "@/components/admin/AdminTabs";

const ACTIONS = [
  "login",
  "upload",
  "download",
  "delete",
  "create_folder",
  "rename_folder",
  "move_folder",
  "delete_folder",
  "folder_passcode",
  "unlock_folder",
  "move_asset",
  "create_space",
  "create_user",
  "invite_user",
  "change_role",
];

export function AdminActivityClient() {
  const [entries, setEntries] = useState<(ActivityLog & { summary?: string })[]>(
    [],
  );
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (spaceId) params.set("space_id", spaceId);
    if (userId) params.set("user_id", userId);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const [actRes, spacesRes, usersRes] = await Promise.all([
      fetch(`/api/admin/activity?${params}`),
      fetch("/api/admin/spaces"),
      fetch("/api/admin/users"),
    ]);
    const actJson = await actRes.json();
    const spacesJson = await spacesRes.json();
    const usersJson = await usersRes.json();
    if (actRes.ok) setEntries(actJson.entries as ActivityLog[]);
    if (spacesRes.ok) setSpaces(spacesJson.spaces as Space[]);
    if (usersRes.ok) setUsers(usersJson.users as Profile[]);
  }, [spaceId, userId, action, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <AdminTabs />
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="select select-bordered select-sm min-w-[140px]"
        >
          <option value="">All spaces</option>
          {spaces.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="select select-bordered select-sm min-w-[140px]"
        >
          <option value="">All people</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="select select-bordered select-sm min-w-[140px]"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 type-caption opacity-60">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input input-bordered input-sm min-w-[9rem]"
          />
        </label>
        <label className="flex items-center gap-1.5 type-caption opacity-60">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input input-bordered input-sm min-w-[9rem]"
          />
        </label>
      </div>

      <div className="flex flex-col gap-0.5">
        {entries.length === 0 ? (
          <p className="px-2 py-6 type-body opacity-60">
            No activity yet.
          </p>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="px-2 py-2.5 type-body rounded-lg hover:bg-base-200"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-base-content">
                  {e.summary || e.action}
                </span>
                <span className="text-base-content/60 ml-auto text-xs">
                  {e.created_at
                    ? new Date(e.created_at).toLocaleString()
                    : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
