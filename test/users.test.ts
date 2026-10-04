import assert from "node:assert/strict";
import test from "node:test";
import { processUserStatusUpdate, processUserUpsert } from "../src/functions/users";
import type {
  UserRecord,
  UserRegistry,
  UserTableClient,
  UserUpsertResult,
} from "../src/users/userRegistry";
import { AzureTableUserRegistry } from "../src/users/userRegistry";

const activeUser: UserRecord = {
  userId: "user-123",
  displayName: "Jane Doe",
  status: "active",
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
};

function createRegistry(overrides: Partial<UserRegistry> = {}): UserRegistry {
  return {
    upsertActive: async (): Promise<UserUpsertResult> => ({
      created: true,
      user: activeUser,
    }),
    markInactive: async () => ({ ...activeUser, status: "inactive" }),
    ...overrides,
  };
}

function statusError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode });
}

test("creates an active user", async () => {
  const response = await processUserUpsert(
    "user-123",
    { displayName: " Jane Doe " },
    createRegistry({
      upsertActive: async (userId, displayName) => {
        assert.equal(userId, "user-123");
        assert.equal(displayName, "Jane Doe");
        return { created: true, user: activeUser };
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.jsonBody, { success: true, data: activeUser });
});

test("reactivates an existing user idempotently", async () => {
  const response = await processUserUpsert(
    "user-123",
    { displayName: "Jane Doe" },
    createRegistry({
      upsertActive: async () => ({ created: false, user: activeUser }),
    }),
  );

  assert.equal(response.status, 200);
});

test("rejects invalid user identifiers before storage", async () => {
  let called = false;
  const response = await processUserUpsert(
    "user/id",
    { displayName: "Jane Doe" },
    createRegistry({
      upsertActive: async () => {
        called = true;
        return { created: true, user: activeUser };
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("rejects unknown signup fields", async () => {
  const response = await processUserUpsert(
    "user-123",
    { displayName: "Jane Doe", status: "active" },
    createRegistry(),
  );

  assert.equal(response.status, 400);
});

test("marks an existing user inactive", async () => {
  const inactiveUser = { ...activeUser, status: "inactive" as const };
  const response = await processUserStatusUpdate(
    "user-123",
    { status: "inactive" },
    createRegistry({ markInactive: async () => inactiveUser }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, { success: true, data: inactiveUser });
});

test("returns not found when deactivating an unknown user", async () => {
  const response = await processUserStatusUpdate(
    "missing-user",
    { status: "inactive" },
    createRegistry({ markInactive: async () => null }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: { code: "USER_NOT_FOUND", message: "User was not found" },
  });
});

test("does not expose storage errors", async () => {
  const response = await processUserUpsert(
    "user-123",
    { displayName: "Jane Doe" },
    createRegistry({
      upsertActive: async () => {
        throw new Error("secret storage detail");
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: { code: "STORAGE_UNAVAILABLE", message: "User registry is unavailable" },
  });
});

test("retries a competing initial create as an ETag-guarded reactivation", async () => {
  let readCount = 0;
  const updates: Array<{ entity: unknown; mode: string; etag: string }> = [];
  const client = {
    createTable: async () => undefined,
    createEntity: async () => {
      throw statusError(409);
    },
    getEntity: async () => {
      readCount += 1;
      if (readCount === 1) {
        throw statusError(404);
      }
      return {
        partitionKey: "users",
        rowKey: "user-123",
        displayName: "Earlier Name",
        status: "inactive",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        etag: "etag-2",
      };
    },
    updateEntity: async (entity: unknown, mode: string, options: { etag: string }) => {
      updates.push({ entity, mode, etag: options.etag });
    },
  } as unknown as UserTableClient;
  const registry = new AzureTableUserRegistry("unused", "CecyUsers", client);

  const result = await registry.upsertActive("user-123", "Jane Doe");

  assert.equal(result.created, false);
  assert.equal(result.user.displayName, "Jane Doe");
  assert.equal(result.user.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.mode, "Replace");
  assert.equal(updates[0]?.etag, "etag-2");
});

test("retries deactivation conflicts and merges without replacing display name", async () => {
  let readCount = 0;
  const updates: Array<{
    entity: Record<string, unknown>;
    mode: string;
    etag: string;
  }> = [];
  const client = {
    createTable: async () => undefined,
    createEntity: async () => undefined,
    getEntity: async () => {
      readCount += 1;
      return {
        partitionKey: "users",
        rowKey: "user-123",
        displayName: readCount === 1 ? "Jane Doe" : "Jane Smith",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        etag: `etag-${readCount}`,
      };
    },
    updateEntity: async (
      entity: Record<string, unknown>,
      mode: string,
      options: { etag: string },
    ) => {
      updates.push({ entity, mode, etag: options.etag });
      if (updates.length === 1) {
        throw statusError(412);
      }
    },
  } as unknown as UserTableClient;
  const registry = new AzureTableUserRegistry("unused", "CecyUsers", client);

  const result = await registry.markInactive("user-123");

  assert.equal(result?.displayName, "Jane Smith");
  assert.equal(result?.status, "inactive");
  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.mode, "Merge");
  assert.equal(updates[1]?.etag, "etag-2");
  assert.deepEqual(Object.keys(updates[1]?.entity ?? {}).sort(), [
    "partitionKey",
    "rowKey",
    "status",
    "updatedAt",
  ]);
});