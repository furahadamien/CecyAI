import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { getUserRegistry, type UserRegistry } from "../users/userRegistry";

const UserIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._~-]+$/);
const UpsertUserSchema = z.object({ displayName: z.string().trim().min(1).max(120) }).strict();
const UserStatusSchema = z.object({ status: z.literal("inactive") }).strict();

function response(status: number, jsonBody: unknown): HttpResponseInit {
  return { status, jsonBody };
}

function invalidRequest(message: string): HttpResponseInit {
  return response(400, {
    success: false,
    error: { code: "INVALID_REQUEST", message },
  });
}

function storageUnavailable(): HttpResponseInit {
  return response(500, {
    success: false,
    error: { code: "STORAGE_UNAVAILABLE", message: "User registry is unavailable" },
  });
}

export async function processUserUpsert(
  userId: unknown,
  body: unknown,
  registry: UserRegistry,
): Promise<HttpResponseInit> {
  const parsedUserId = UserIdSchema.safeParse(userId);
  if (!parsedUserId.success) {
    return invalidRequest("userId is invalid");
  }

  const parsedBody = UpsertUserSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequest("displayName is required and must be 120 characters or fewer");
  }

  try {
    const result = await registry.upsertActive(parsedUserId.data, parsedBody.data.displayName);
    return response(result.created ? 201 : 200, { success: true, data: result.user });
  } catch {
    return storageUnavailable();
  }
}

export async function processUserStatusUpdate(
  userId: unknown,
  body: unknown,
  registry: UserRegistry,
): Promise<HttpResponseInit> {
  const parsedUserId = UserIdSchema.safeParse(userId);
  if (!parsedUserId.success) {
    return invalidRequest("userId is invalid");
  }

  const parsedBody = UserStatusSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequest("status must be inactive");
  }

  try {
    const user = await registry.markInactive(parsedUserId.data);
    if (user === null) {
      return response(404, {
        success: false,
        error: { code: "USER_NOT_FOUND", message: "User was not found" },
      });
    }
    return response(200, { success: true, data: user });
  } catch {
    return storageUnavailable();
  }
}

async function parseJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function upsertUser(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  let result: HttpResponseInit;
  try {
    result = await processUserUpsert(
      request.params.userId,
      await parseJson(request),
      getUserRegistry(),
    );
  } catch {
    result = storageUnavailable();
  }
  context.log(`operation=user_upsert status=${result.status} durationMs=${Date.now() - startedAt}`);
  return result;
}

export async function deactivateUser(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  let result: HttpResponseInit;
  try {
    result = await processUserStatusUpdate(
      request.params.userId,
      await parseJson(request),
      getUserRegistry(),
    );
  } catch {
    result = storageUnavailable();
  }
  context.log(
    `operation=user_deactivate status=${result.status} durationMs=${Date.now() - startedAt}`,
  );
  return result;
}

app.http("upsertUser", {
  methods: ["PUT"],
  authLevel: "function",
  route: "users/{userId}",
  handler: upsertUser,
});

app.http("deactivateUser", {
  methods: ["PATCH"],
  authLevel: "function",
  route: "users/{userId}/status",
  handler: deactivateUser,
});