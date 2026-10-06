import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// dashboardEvents.ts only needs a URL string out of this — stub it rather than depending on
// import.meta.env being populated under vitest (env.ts's getEnv alert()s and throws otherwise).
vi.mock("@/config/env", () => ({
  env: { popApiUrl: () => "http://localhost:0/pop" },
}));

// Minimal EventSource stand-in — just enough to drive dashboardEvents.ts's own listeners
// (addEventListener/close), not a real SSE client. Each test gets a fresh module (see
// loadFreshModule) so the module's singleton state (es/refCount/watchdogArmed/watchdogTimer)
// never leaks between cases.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners[type] || []) fn({ data });
  }
}

async function loadFreshModule() {
  vi.resetModules();
  FakeEventSource.instances = [];
  (globalThis as any).EventSource = FakeEventSource;
  return import("./dashboardEvents");
}

// Covers the state machine the peer session flagged a bug in: a real event must never ARM an
// unarmed watchdog (only `ping` can), or one real event against a no-ping backend starts a
// close/reconnect loop once the stream goes quiet again — the same regression entered through a
// different door than "never receiving a ping at all". These three cases are exactly the ones a
// live :8032 vs. :8047 test can't safely cover in one place: (a) needs an old (no-ping) backend
// AND a real event, (b) needs a new (ping) backend, (c) needs a reconnect — pure state-machine
// logic, so it belongs here with fake timers rather than against a live database.
describe("dashboardEvents watchdog arm/disarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a real event with no prior ping never arms the watchdog (old backend, e.g. :8032 pre-fix)", async () => {
    const { subscribeDashboardEvents } = await loadFreshModule();
    const unsubscribe = subscribeDashboardEvents({ document: () => {} });
    const conn = FakeEventSource.instances[0];

    conn.emit("open");
    conn.emit("document", JSON.stringify({ unique_document_id: "abc" }));
    vi.advanceTimersByTime(60_000);

    expect(conn.closed).toBe(false);
    expect(FakeEventSource.instances.length).toBe(1);
    unsubscribe();
  });

  it("ping arms the watchdog, and it trips ~35s after the last reset (new backend, e.g. :8047)", async () => {
    const { subscribeDashboardEvents } = await loadFreshModule();
    const unsubscribe = subscribeDashboardEvents({ document: () => {} });
    const conn = FakeEventSource.instances[0];

    conn.emit("open");
    conn.emit("ping");
    conn.emit("document", JSON.stringify({ unique_document_id: "abc" }));
    vi.advanceTimersByTime(35_000);

    expect(conn.closed).toBe(true);
    expect(FakeEventSource.instances.length).toBe(2);
    unsubscribe();
  });

  it("disarms on reconnect, so a reconnect to a no-ping backend never trips afterward", async () => {
    const { subscribeDashboardEvents } = await loadFreshModule();
    const unsubscribe = subscribeDashboardEvents({ document: () => {} });
    const conn = FakeEventSource.instances[0];

    conn.emit("open");
    conn.emit("ping"); // armed
    conn.emit("open"); // reconnect — must disarm
    vi.advanceTimersByTime(60_000);

    expect(conn.closed).toBe(false);
    expect(FakeEventSource.instances.length).toBe(1);
    unsubscribe();
  });
});
