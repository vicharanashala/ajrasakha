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

// Dead-stream watchdog. A proxy/NAT can silently stop forwarding a socket without closing it —
// the connection stays "open" forever and delivers nothing, which EventSource's own retry does
// NOT catch (that only fires on an actual error/close). The backend sends a named `ping` event
// every 15s (KEEPALIVE_SECONDS) specifically so JS can detect this; a plain SSE comment
// (`: keep-alive`) doesn't surface to EventSource at all, which is what made this gap real before
// `ping` existed.
//
// MUST stay disarmed until the first `ping` is actually seen on this connection — `ping` is a
// capability signal, not just a heartbeat. Arming unconditionally is a trap: against a backend
// that doesn't send `ping` (:8032 as of 2026-10-06), an idle dashboard produces no real events
// either, so an unconditionally-armed timer trips every 35s forever — close/reopen, "open" fires,
// refetch, 35s of silence, trip again — which is strictly worse than the gap it was meant to fix
// (refetching twice as often as the 60s poll, against the same near-capacity Atlas free tier, and
// churning the connection like a flapping client in the server log). So: `ping` arms-or-resets;
// a real event resets ONLY if already armed (an unarmed timer must stay unarmed even after a real
// event — otherwise one upload against the old backend arms it, and once that upload finishes the
// stream goes quiet and you're back in the same loop through a different door); reconnecting
// disarms, so a reconnect to an old backend doesn't leave a stale armed timer either. Net effect:
// genuinely inert against a no-ping backend (behaves exactly as if this didn't exist, 60s poll
// stays the only safety net), and gives ~35s dead-stream detection within 15s of connecting to one
// that does.
const WATCHDOG_MS = 35000;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogArmed = false;
function clearWatchdogTimer() {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
}
function startWatchdogTimer() {
  clearWatchdogTimer();
  watchdogTimer = setTimeout(() => {
    if (!es) return;
    es.close();
    es = null;
    ensureConnection();
  }, WATCHDOG_MS);
}
function disarmWatchdog() {
  watchdogArmed = false;
  clearWatchdogTimer();
}
function armOrResetWatchdog() {
  watchdogArmed = true;
  startWatchdogTimer();
}
function resetWatchdogIfArmed() {
  if (watchdogArmed) startWatchdogTimer();
}

function ensureConnection() {
  if (es) return;
  es = new EventSource(`${POP_API}/dashboard/events`);
  // withCredentials defaults to false — keep it that way. The proxy answers with
  // Access-Control-Allow-Origin: * (see backend/src/index.ts), which browsers reject for
  // credentialed requests.
  es.addEventListener("open", () => {
    // Disarm on every (re)connect — the watchdog only re-arms once a `ping` actually lands on
    // THIS connection, so reconnecting to an old, no-ping backend never leaves a stale armed timer.
    disarmWatchdog();
    for (const fn of listeners.open) fn(null);
  });
  es.addEventListener("ping", () => armOrResetWatchdog());
  for (const kind of ["upload", "translation", "document"] as const) {
    es.addEventListener(kind, (e: Event) => {
      resetWatchdogIfArmed();
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
  // caller is expected to keep a slow fallback poll running alongside this subscription (that poll
  // also covers a genuinely missed event under the 500-message subscriber buffer, which the
  // watchdog above doesn't — it only recovers a stream that's gone silent).
}

function teardownIfUnused() {
  if (refCount <= 0 && es) {
    disarmWatchdog();
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
