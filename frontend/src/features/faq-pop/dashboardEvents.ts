import { env } from "@/config/env";

const POP_API = (env.popApiUrl() || "").replace(/\/$/, "");

type EventKind = "upload" | "translation" | "document" | "open";
type Listener = (data: any) => void;

let es: EventSource | null = null;
let refCount = 0;
const listeners: Record<EventKind, Set<Listener>> = {
  upload: new Set(),
  translation: new Set(),
  document: new Set(),
  open: new Set(),
};

function ensureConnection() {
  if (es) return;
  es = new EventSource(`${POP_API}/dashboard/events`);
  // withCredentials defaults to false — keep it that way. The proxy answers with
  // Access-Control-Allow-Origin: * (see backend/src/index.ts), which browsers reject for
  // credentialed requests.
  es.addEventListener("open", () => {
    for (const fn of listeners.open) fn(null);
  });
  for (const kind of ["upload", "translation", "document"] as const) {
    es.addEventListener(kind, (e: Event) => {
      let data;
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch {
        return;
      }
      for (const fn of listeners[kind]) fn(data);
    });
  }
  // No onerror handling: EventSource retries on its own with backoff, and "open" fires again on
  // every successful reconnect — callers refetch there. Until GET /dashboard/events is deployed,
  // this just fails and retries quietly (no thrown error, nothing to catch), which is why every
  // caller is expected to keep a slow fallback poll running alongside this subscription.
}

function teardownIfUnused() {
  if (refCount <= 0 && es) {
    es.close();
    es = null;
  }
}

/**
 * Subscribe to the dashboard's shared SSE stream (GET /dashboard/events). One underlying
 * EventSource for the whole app, ref-counted — browsers cap concurrent EventSource connections
 * per origin at 6, and multiple table rows/panels all want events. No auth, no replay on
 * reconnect, so refetch your own state in the "open" handler (fires on first connect AND every
 * reconnect). Returns an unsubscribe function; the underlying connection closes once nothing is
 * listening anymore.
 */
export function subscribeDashboardEvents(handlers: Partial<Record<EventKind, Listener>>) {
  refCount++;
  ensureConnection();
  const added: [EventKind, Listener][] = [];
  for (const kind of Object.keys(handlers) as EventKind[]) {
    const fn = handlers[kind];
    if (!fn) continue;
    listeners[kind].add(fn);
    added.push([kind, fn]);
  }
  return function unsubscribe() {
    for (const [kind, fn] of added) listeners[kind].delete(fn);
    refCount--;
    teardownIfUnused();
  };
}
