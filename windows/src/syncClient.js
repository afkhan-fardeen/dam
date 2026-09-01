/**
 * Batch filesystem events → Next.js /api/fs/sync-events
 */
export function createSyncClient({ nextSyncUrl, syncServiceKey }) {
  /** @type {Map<string, object>} */
  const pending = new Map();
  let timer = null;

  function enqueue(event) {
    const key = `${event.type}:${event.relative_path}`;
    pending.set(key, { ...event, at: new Date().toISOString() });
    if (!timer) {
      timer = setTimeout(flush, 1500);
    }
  }

  async function flush() {
    timer = null;
    if (!nextSyncUrl || !syncServiceKey) {
      pending.clear();
      return;
    }
    const events = [...pending.values()];
    pending.clear();
    if (events.length === 0) return;
    try {
      const res = await fetch(nextSyncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-service-key": syncServiceKey,
        },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[sync] Next rejected events", res.status, text.slice(0, 200));
      }
    } catch (err) {
      console.warn("[sync] failed to push events", err?.message || err);
    }
  }

  return { enqueue, flush };
}
