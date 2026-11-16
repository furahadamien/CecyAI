import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  MAX_EVENT_AGE_DAYS,
  MAX_EVENT_FUTURE_MINUTES,
  MAX_TELEMETRY_REQUEST_BYTES,
  TelemetryBatchSchema,
} from "../telemetry/telemetrySchema";
import { getTelemetryStore, type TelemetryStore } from "../telemetry/telemetryStore";

/**
 * POST /api/telemetry — anonymous usage events. Additive: shares no code path with /api/ai or
 * /api/users, so a telemetry failure can never affect them. Request bodies, IP addresses and user
 * agents are never logged or stored.
 */

function error(status: number, code: string, message: string): HttpResponseInit {
  return { status, jsonBody: { success: false, error: { code, message } } };
}

export async function processTelemetryBatch(
  body: unknown,
  getStore: () => TelemetryStore,
  now: Date = new Date(),
): Promise<HttpResponseInit> {
  const parsed = TelemetryBatchSchema.safeParse(body);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") ?? "";
    return error(400, "INVALID_REQUEST", path ? `${path} is invalid` : "request is invalid");
  }
  const batch = parsed.data;
  const oldest = now.getTime() - MAX_EVENT_AGE_DAYS * 86_400_000;
  const newest = now.getTime() + MAX_EVENT_FUTURE_MINUTES * 60_000;
  const seen = new Set<string>();
  const events = batch.events.filter((event) => {
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time) || time < oldest || time > newest || seen.has(event.id)) {
      return false;
    }
    seen.add(event.id);
    return true;
  });

  if (process.env.TELEMETRY_DISABLED === "true") {
    // Kill switch: accept and discard so clients clear their queue without retrying.
    return { status: 202, jsonBody: { success: true, data: { accepted: 0, dropped: batch.events.length } } };
  }

  try {
    await getStore().record(batch, events, now);
  } catch {
    return error(503, "STORAGE_UNAVAILABLE", "Telemetry storage is unavailable");
  }
  return {
    status: 202,
    jsonBody: {
      success: true,
      data: { accepted: events.length, dropped: batch.events.length - events.length },
    },
  };
}

export async function telemetry(
  request: HttpRequest,
  context: InvocationContext,
  getStore: () => TelemetryStore = getTelemetryStore,
): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  let response: HttpResponseInit;
  let eventCount = 0;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_TELEMETRY_REQUEST_BYTES) {
      response = error(413, "INVALID_REQUEST", "request body is too large");
    } else {
      const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      if (typeof body === "object" && body !== null && Array.isArray((body as { events?: unknown }).events)) {
        eventCount = (body as { events: unknown[] }).events.length;
      }
      response = await processTelemetryBatch(body, getStore);
    }
  } catch {
    response = error(400, "INVALID_REQUEST", "Request body must be valid JSON");
  }
  context.log(
    `operation=telemetry status=${response.status} events=${eventCount} durationMs=${Date.now() - startedAt}`,
  );
  return response;
}

app.http("telemetry", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "telemetry",
  handler: telemetry,
});
