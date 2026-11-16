import { z } from "zod";

/**
 * Anonymous product-usage telemetry (schema v1).
 *
 * Privacy contract enforced here, not only on the client:
 * - The only identifier is a random, app-generated installation UUID. It is never derived from
 *   an Apple ID, device identifier or advertising identifier, and it is reset by the app on opt-out
 *   or "Delete all data".
 * - Event names, screens and property keys are short snake_case tokens; property values are
 *   bounded scalars. Free text, health records, dates of health events and AI content are not
 *   accepted by the client contract and must never be sent.
 * - Network metadata (IP address, user agent) is never stored.
 */

export const TELEMETRY_SCHEMA_VERSION = 1;
export const MAX_TELEMETRY_REQUEST_BYTES = 64 * 1_024;
export const MAX_EVENTS_PER_BATCH = 100;
export const MAX_PROPERTIES_PER_EVENT = 30;
/** Events older than this (e.g. a device offline for months) are dropped rather than stored. */
export const MAX_EVENT_AGE_DAYS = 45;
/** Device clocks can be wrong; events too far in the future are dropped. */
export const MAX_EVENT_FUTURE_MINUTES = 24 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
// Printable, single-line, no markup. Values are enum-like tokens or coarse buckets.
const PROPERTY_STRING_PATTERN = /^[A-Za-z0-9 ._:+\-/]{0,80}$/;
const VERSION_PATTERN = /^[A-Za-z0-9.\-]{1,20}$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const Uuid = z.string().regex(UUID_PATTERN);
const Token = z.string().regex(TOKEN_PATTERN);

export const TelemetryPropertyValueSchema = z.union([
  z.string().regex(PROPERTY_STRING_PATTERN),
  z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  z.boolean(),
]);

export const TelemetryEventSchema = z
  .object({
    id: Uuid,
    name: Token,
    timestamp: z.string().datetime({ offset: true }),
    screen: Token.nullable().optional(),
    properties: z
      .record(z.string().regex(PROPERTY_KEY_PATTERN), TelemetryPropertyValueSchema)
      .refine((value) => Object.keys(value).length <= MAX_PROPERTIES_PER_EVENT, {
        message: `at most ${MAX_PROPERTIES_PER_EVENT} properties`,
      })
      .optional(),
  })
  .strict();

export const TelemetryBatchSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    installId: Uuid,
    /** Local calendar day the installation ID was created; used for retention cohorts. */
    installDay: z.string().regex(DAY_PATTERN),
    sessionId: Uuid,
    app: z
      .object({
        version: z.string().regex(VERSION_PATTERN),
        build: z.string().regex(VERSION_PATTERN),
      })
      .strict(),
    device: z
      .object({
        family: z.enum(["iphone", "ipad", "mac", "vision", "other"]),
        model: z.string().regex(/^[A-Za-z0-9,.\-]{1,40}$/),
        osVersion: z.string().regex(VERSION_PATTERN),
        language: z.string().regex(/^[A-Za-z]{2,8}$/),
        region: z.string().regex(/^[A-Za-z0-9]{2,3}$/).nullable(),
        timeZoneOffsetMinutes: z.number().int().min(-840).max(840),
      })
      .strict(),
    events: z.array(TelemetryEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;
export type TelemetryPropertyValue = z.infer<typeof TelemetryPropertyValueSchema>;
