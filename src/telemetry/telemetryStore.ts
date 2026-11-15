import { TableClient, type TableEntity, type TransactionAction } from "@azure/data-tables";
import type { TelemetryBatch, TelemetryEvent } from "./telemetrySchema";

/**
 * Three tables in the same storage account as the user registry. Each is shaped for a question:
 *
 * - `<prefix>Events`   PK = UTC day (yyyyMMdd), RK = installId_eventId. One row per event: what was
 *                      used, when, on which screen. Idempotent (client retries upsert the same row).
 * - `<prefix>Daily`    PK = UTC day (yyyyMMdd), RK = installId. One row per active installation per
 *                      day: DAU/WAU/MAU, sessions and events per day, days since install.
 * - `<prefix>Installs` PK = install cohort month (yyyyMM), RK = installId. One row per installation:
 *                      first/last seen, number of active days, latest app/OS and latest user state.
 *                      Retention per cohort = lastSeenDay - installDay and activeDays.
 */

const MAX_WRITE_ATTEMPTS = 3;
const MAX_TRANSACTION_ACTIONS = 100;
const DEFAULT_TABLE_PREFIX = "CecyTelemetry";

export interface TelemetryTableClient {
  createTable(): Promise<unknown>;
  createEntity<T extends object>(entity: TableEntity<T>): Promise<unknown>;
  getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T & { etag: string }>;
  updateEntity<T extends object>(
    entity: TableEntity<T>,
    mode: "Merge" | "Replace",
    options: { etag: string },
  ): Promise<unknown>;
  submitTransaction(actions: TransactionAction[]): Promise<unknown>;
}

export interface TelemetryStore {
  record(batch: TelemetryBatch, events: TelemetryEvent[], receivedAt: Date): Promise<void>;
}

export interface TelemetryTables {
  events: TelemetryTableClient;
  daily: TelemetryTableClient;
  installs: TelemetryTableClient;
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === statusCode
  );
}

/** yyyyMMdd in UTC. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function daysBetween(fromDay: string, toDayKey: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(
    `${toDayKey.slice(0, 4)}-${toDayKey.slice(4, 6)}-${toDayKey.slice(6, 8)}T00:00:00Z`,
  );
  return Math.round((to - from) / 86_400_000);
}

/** Flattened `p_<key>` columns make events filterable in Storage Explorer, Power BI and ADX. */
function propertyColumns(event: TelemetryEvent, prefix: string): Record<string, string | number | boolean> {
  const columns: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    columns[`${prefix}${key}`] = value;
  }
  return columns;
}

function commonColumns(batch: TelemetryBatch) {
  return {
    installId: batch.installId,
    installDay: batch.installDay,
    appVersion: batch.app.version,
    appBuild: batch.app.build,
    deviceFamily: batch.device.family,
    deviceModel: batch.device.model,
    osVersion: batch.device.osVersion,
    language: batch.device.language,
    region: batch.device.region ?? "",
    timeZoneOffsetMinutes: batch.device.timeZoneOffsetMinutes,
  };
}

export class AzureTableTelemetryStore implements TelemetryStore {
  private readonly tables: TelemetryTables;
  private ready: Promise<void> | undefined;

  constructor(tables: TelemetryTables) {
    this.tables = tables;
  }

  async record(batch: TelemetryBatch, events: TelemetryEvent[], receivedAt: Date): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.ensureTables();
    await this.writeEvents(batch, events, receivedAt);

    const byDay = new Map<string, TelemetryEvent[]>();
    for (const event of events) {
      const day = utcDayKey(new Date(event.timestamp));
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }
    let newActiveDays = 0;
    for (const day of [...byDay.keys()].sort()) {
      if (await this.updateDaily(batch, day, byDay.get(day) ?? [], receivedAt)) {
        newActiveDays += 1;
      }
    }
    await this.updateInstall(batch, events, newActiveDays, receivedAt);
  }

  private async writeEvents(batch: TelemetryBatch, events: TelemetryEvent[], receivedAt: Date) {
    const common = commonColumns(batch);
    const byPartition = new Map<string, TransactionAction[]>();
    for (const event of events) {
      const eventDate = new Date(event.timestamp);
      const partitionKey = utcDayKey(eventDate);
      const entity = {
        partitionKey,
        rowKey: `${batch.installId}_${event.id}`,
        ...common,
        sessionId: batch.sessionId,
        eventId: event.id,
        name: event.name,
        screen: event.screen ?? "",
        clientTime: event.timestamp,
        eventTime: eventDate.toISOString(),
        receivedAt: receivedAt.toISOString(),
        daysSinceInstall: daysBetween(batch.installDay, partitionKey),
        propertiesJson: JSON.stringify(event.properties ?? {}),
        ...propertyColumns(event, "p_"),
      };
      const actions = byPartition.get(partitionKey) ?? [];
      actions.push(["upsert", entity, "Replace"]);
      byPartition.set(partitionKey, actions);
    }
    for (const actions of byPartition.values()) {
      for (let index = 0; index < actions.length; index += MAX_TRANSACTION_ACTIONS) {
        await this.tables.events.submitTransaction(actions.slice(index, index + MAX_TRANSACTION_ACTIONS));
      }
    }
  }

  /** Returns true when this is the installation's first activity on `day`. */
  private async updateDaily(
    batch: TelemetryBatch,
    day: string,
    events: TelemetryEvent[],
    receivedAt: Date,
  ): Promise<boolean> {
    const times = events.map((event) => new Date(event.timestamp).toISOString()).sort();
    const sessions = events.filter((event) => event.name === "session_start").length;
    const screens = events.filter((event) => event.name === "screen_view").length;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const existing = await this.get<Record<string, unknown>>(this.tables.daily, day, batch.installId);
      const entity = {
        partitionKey: day,
        rowKey: batch.installId,
        ...commonColumns(batch),
        daysSinceInstall: daysBetween(batch.installDay, day),
        firstEventAt:
          existing && typeof existing.firstEventAt === "string" && existing.firstEventAt < times[0]
            ? existing.firstEventAt
            : times[0],
        lastEventAt:
          existing && typeof existing.lastEventAt === "string" && existing.lastEventAt > times[times.length - 1]
            ? existing.lastEventAt
            : times[times.length - 1],
        eventCount: numberOrZero(existing?.eventCount) + events.length,
        sessionCount: numberOrZero(existing?.sessionCount) + sessions,
        screenViewCount: numberOrZero(existing?.screenViewCount) + screens,
        updatedAt: receivedAt.toISOString(),
      };
      try {
        if (existing === null) {
          await this.tables.daily.createEntity(entity);
          return true;
        }
        await this.tables.daily.updateEntity(entity, "Replace", { etag: existing.etag });
        return false;
      } catch (error) {
        const conflict = hasStatusCode(error, 409) || hasStatusCode(error, 412);
        if (!conflict || attempt === MAX_WRITE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    return false;
  }

  private async updateInstall(
    batch: TelemetryBatch,
    events: TelemetryEvent[],
    newActiveDays: number,
    receivedAt: Date,
  ) {
    const partitionKey = batch.installDay.slice(0, 7).replace("-", "");
    const times = events.map((event) => new Date(event.timestamp).toISOString()).sort();
    // The most recent `user_state` snapshot (coarse buckets only) is mirrored as s_<key> columns.
    const latestState = [...events]
      .filter((event) => event.name === "user_state")
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .pop();
    const milestones: Record<string, string> = {};
    for (const event of events) {
      if (MILESTONES.has(event.name)) {
        milestones[`milestone_${event.name}`] = new Date(event.timestamp).toISOString();
      }
    }
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const existing = await this.get<Record<string, unknown>>(
        this.tables.installs,
        partitionKey,
        batch.installId,
      );
      const keptMilestones: Record<string, string> = {};
      for (const [key, value] of Object.entries(milestones)) {
        const previous = existing?.[key];
        // Keep the first time a milestone happened.
        keptMilestones[key] = typeof previous === "string" && previous < value ? previous : value;
      }
      const firstSeenAt =
        existing && typeof existing.firstSeenAt === "string" && existing.firstSeenAt < times[0]
          ? existing.firstSeenAt
          : times[0];
      const lastSeenAt =
        existing && typeof existing.lastSeenAt === "string" && existing.lastSeenAt > times[times.length - 1]
          ? existing.lastSeenAt
          : times[times.length - 1];
      const entity = {
        partitionKey,
        rowKey: batch.installId,
        ...commonColumns(batch),
        firstSeenAt,
        lastSeenAt,
        lastSeenDay: lastSeenAt.slice(0, 10),
        daysSinceInstallAtLastSeen: daysBetween(batch.installDay, utcDayKey(new Date(lastSeenAt))),
        activeDays: numberOrZero(existing?.activeDays) + newActiveDays,
        totalEvents: numberOrZero(existing?.totalEvents) + events.length,
        totalSessions:
          numberOrZero(existing?.totalSessions) +
          events.filter((event) => event.name === "session_start").length,
        updatedAt: receivedAt.toISOString(),
        ...keptMilestones,
        ...(latestState ? propertyColumns(latestState, "s_") : {}),
      };
      try {
        if (existing === null) {
          await this.tables.installs.createEntity(entity);
          return;
        }
        // Merge keeps earlier milestones and state columns that this batch does not mention.
        await this.tables.installs.updateEntity(entity, "Merge", { etag: existing.etag });
        return;
      } catch (error) {
        const conflict = hasStatusCode(error, 409) || hasStatusCode(error, 412);
        if (!conflict || attempt === MAX_WRITE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
  }

  private async get<T extends object>(
    client: TelemetryTableClient,
    partitionKey: string,
    rowKey: string,
  ): Promise<(T & { etag: string }) | null> {
    try {
      return await client.getEntity<T>(partitionKey, rowKey);
    } catch (error) {
      if (hasStatusCode(error, 404)) {
        return null;
      }
      throw error;
    }
  }

  private async ensureTables(): Promise<void> {
    this.ready ??= Promise.all(
      [this.tables.events, this.tables.daily, this.tables.installs].map((client) =>
        client.createTable().catch((error: unknown) => {
          if (!hasStatusCode(error, 409)) {
            throw error;
          }
        }),
      ),
    )
      .then(() => undefined)
      .catch((error: unknown) => {
        this.ready = undefined;
        throw error;
      });
    await this.ready;
  }
}

/** First occurrence of these events is copied onto the installation row (funnel analysis). */
const MILESTONES = new Set([
  "onboarding_started",
  "onboarding_completed",
  "first_record_saved",
  "ai_enabled",
  "daily_insights_viewed",
]);

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

let store: TelemetryStore | undefined;

export function getTelemetryStore(): TelemetryStore {
  if (store) {
    return store;
  }
  // Same storage account as the user registry unless explicitly overridden.
  const connectionString =
    process.env.TELEMETRY_STORAGE_CONNECTION ??
    process.env.USER_REGISTRY_STORAGE_CONNECTION ??
    process.env.AzureWebJobsStorage;
  if (!connectionString) {
    throw new Error("Telemetry storage is not configured");
  }
  const prefix = process.env.TELEMETRY_TABLE_PREFIX ?? DEFAULT_TABLE_PREFIX;
  const client = (suffix: string) =>
    TableClient.fromConnectionString(connectionString, `${prefix}${suffix}`) as unknown as TelemetryTableClient;
  store = new AzureTableTelemetryStore({
    events: client("Events"),
    daily: client("Daily"),
    installs: client("Installs"),
  });
  return store;
}
