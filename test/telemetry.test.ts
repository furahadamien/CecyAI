import assert from "node:assert/strict";
import test from "node:test";
import type { TableEntity, TransactionAction } from "@azure/data-tables";
import { processTelemetryBatch } from "../src/functions/telemetry";
import {
  AzureTableTelemetryStore,
  type TelemetryStore,
  type TelemetryTableClient,
} from "../src/telemetry/telemetryStore";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const INSTALL = "0b6f7a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b";
const SESSION = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

function eventId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function batch(events: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    installId: INSTALL,
    installDay: "2026-11-01",
    sessionId: SESSION,
    app: { version: "1.0.4", build: "9" },
    device: {
      family: "iphone",
      model: "iPhone16,2",
      osVersion: "26.1",
      language: "en",
      region: "US",
      timeZoneOffsetMinutes: -480,
    },
    events,
    ...overrides,
  };
}

function event(index: number, name: string, extra: Record<string, unknown> = {}) {
  return { id: eventId(index), name, timestamp: "2026-11-15T11:00:00.000Z", ...extra };
}

class MemoryTable implements TelemetryTableClient {
  rows = new Map<string, Record<string, unknown>>();
  etag = 0;
  async createTable() {}
  async createEntity<T extends object>(entity: TableEntity<T>) {
    const key = `${entity.partitionKey}|${entity.rowKey}`;
    if (this.rows.has(key)) throw Object.assign(new Error("exists"), { statusCode: 409 });
    this.rows.set(key, { ...entity, etag: String(++this.etag) });
  }
  async getEntity<T extends object>(partitionKey: string, rowKey: string) {
    const row = this.rows.get(`${partitionKey}|${rowKey}`);
    if (!row) throw Object.assign(new Error("missing"), { statusCode: 404 });
    return { ...row } as T & { etag: string };
  }
  async updateEntity<T extends object>(entity: TableEntity<T>, mode: "Merge" | "Replace", options: { etag: string }) {
    const key = `${entity.partitionKey}|${entity.rowKey}`;
    const existing = this.rows.get(key);
    if (!existing || existing.etag !== options.etag) throw Object.assign(new Error("etag"), { statusCode: 412 });
    this.rows.set(key, { ...(mode === "Merge" ? existing : {}), ...entity, etag: String(++this.etag) });
  }
  async submitTransaction(actions: TransactionAction[]) {
    const partitions = new Set(actions.map((action) => (action[1] as TableEntity).partitionKey));
    assert.equal(partitions.size, 1, "a transaction must target one partition");
    for (const action of actions) {
      const entity = action[1] as TableEntity<Record<string, unknown>>;
      this.rows.set(`${entity.partitionKey}|${entity.rowKey}`, { ...entity, etag: String(++this.etag) });
    }
  }
}

function memoryStore() {
  const tables = { events: new MemoryTable(), daily: new MemoryTable(), installs: new MemoryTable() };
  return { tables, store: new AzureTableTelemetryStore(tables) };
}

test("stores events, a daily activity row and an installation row", async () => {
  const { tables, store } = memoryStore();
  const response = await processTelemetryBatch(
    batch([
      event(1, "session_start"),
      event(2, "screen_view", { screen: "today" }),
      event(3, "user_state", { properties: { periods_bucket: "2_5", ai_enabled: true } }),
      event(4, "onboarding_completed"),
    ]),
    () => store,
    NOW,
  );

  assert.equal(response.status, 202);
  assert.deepEqual(response.jsonBody, { success: true, data: { accepted: 4, dropped: 0 } });
  assert.equal(tables.events.rows.size, 4);
  const screen = tables.events.rows.get(`20261115|${INSTALL}_${eventId(2)}`);
  assert.equal(screen?.screen, "today");
  assert.equal(screen?.daysSinceInstall, 14);

  const daily = tables.daily.rows.get(`20261115|${INSTALL}`);
  assert.equal(daily?.eventCount, 4);
  assert.equal(daily?.sessionCount, 1);
  assert.equal(daily?.screenViewCount, 1);

  const install = tables.installs.rows.get(`202611|${INSTALL}`);
  assert.equal(install?.activeDays, 1);
  assert.equal(install?.s_periods_bucket, "2_5");
  assert.equal(install?.s_ai_enabled, true);
  assert.equal(install?.milestone_onboarding_completed, "2026-11-15T11:00:00.000Z");
});

test("counts each active day once and keeps first milestones", async () => {
  const { tables, store } = memoryStore();
  await processTelemetryBatch(batch([event(1, "onboarding_completed")]), () => store, NOW);
  await processTelemetryBatch(batch([event(2, "screen_view")]), () => store, NOW);
  await processTelemetryBatch(
    batch([event(3, "onboarding_completed", { timestamp: "2026-11-15T11:30:00.000Z" })]),
    () => store,
    NOW,
  );
  await processTelemetryBatch(
    batch([event(4, "session_start", { timestamp: "2026-11-14T09:00:00.000Z" })]),
    () => store,
    NOW,
  );

  const install = tables.installs.rows.get(`202611|${INSTALL}`);
  assert.equal(install?.activeDays, 2);
  assert.equal(install?.totalEvents, 4);
  assert.equal(install?.firstSeenAt, "2026-11-14T09:00:00.000Z");
  assert.equal(install?.lastSeenAt, "2026-11-15T11:30:00.000Z");
  assert.equal(install?.milestone_onboarding_completed, "2026-11-15T11:00:00.000Z");
  assert.equal(tables.daily.rows.get(`20261115|${INSTALL}`)?.eventCount, 3);
});

test("retried batches are idempotent for event rows", async () => {
  const { tables, store } = memoryStore();
  const body = batch([event(1, "screen_view")]);
  await processTelemetryBatch(body, () => store, NOW);
  await processTelemetryBatch(body, () => store, NOW);
  assert.equal(tables.events.rows.size, 1);
});

test("drops stale, future and duplicate events without failing the batch", async () => {
  const { tables, store } = memoryStore();
  const response = await processTelemetryBatch(
    batch([
      event(1, "screen_view"),
      event(1, "screen_view"),
      event(2, "screen_view", { timestamp: "2026-08-01T00:00:00.000Z" }),
      event(3, "screen_view", { timestamp: "2026-11-20T00:00:00.000Z" }),
    ]),
    () => store,
    NOW,
  );
  assert.deepEqual(response.jsonBody, { success: true, data: { accepted: 1, dropped: 3 } });
  assert.equal(tables.events.rows.size, 1);
});

test("rejects free text, unknown fields and identifier-shaped values", async () => {
  const neverCalled: () => TelemetryStore = () => {
    throw new Error("store must not be used");
  };
  const cases = [
    batch([event(1, "screen_view", { properties: { note: "I had heavy bleeding\nand cramps" } })]),
    batch([event(1, "Screen View")]),
    batch([event(1, "screen_view", { extra: true })]),
    batch([event(1, "screen_view")], { installId: "apple-user-001234" }),
    batch([event(1, "screen_view")], { email: "a@b.com" }),
    batch([]),
    batch([event(1, "screen_view", { properties: { text: "<b>x</b>" } })]),
  ];
  for (const body of cases) {
    const response = await processTelemetryBatch(body, neverCalled, NOW);
    assert.equal(response.status, 400);
  }
});

test("storage failures return 503 so the client keeps its queue", async () => {
  const response = await processTelemetryBatch(
    batch([event(1, "screen_view")]),
    () => ({
      record: async () => {
        throw new Error("down");
      },
    }),
    NOW,
  );
  assert.equal(response.status, 503);
});

test("kill switch accepts and discards", async () => {
  process.env.TELEMETRY_DISABLED = "true";
  try {
    const response = await processTelemetryBatch(
      batch([event(1, "screen_view")]),
      () => {
        throw new Error("store must not be used");
      },
      NOW,
    );
    assert.equal(response.status, 202);
    assert.deepEqual(response.jsonBody, { success: true, data: { accepted: 0, dropped: 1 } });
  } finally {
    delete process.env.TELEMETRY_DISABLED;
  }
});
