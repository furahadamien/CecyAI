import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AIResponseInvalidError, AIUnavailableError } from "../ai/openAIClient";
import { routeTask, type TaskDependencies } from "../ai/taskRouter";
import type { AIErrorCode, AIErrorResponse } from "../models/AIResponse";
import { isSupportedTask, validateAIRequest } from "../validation/requestValidation";

function errorResponse(
  status: number,
  code: AIErrorCode,
  message: string,
): HttpResponseInit {
  const body: AIErrorResponse = {
    success: false,
    error: { code, message },
  };
  return { status, jsonBody: body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function processAIRequest(
  body: unknown,
  dependencies: Partial<TaskDependencies> = {},
): Promise<HttpResponseInit> {
  const validation = validateAIRequest(body);
  if (!validation.success) {
    return errorResponse(400, validation.code, validation.message);
  }

  try {
    const data = await routeTask(validation.data, dependencies);
    return {
      status: 200,
      jsonBody: { success: true, data },
    };
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return errorResponse(502, "AI_UNAVAILABLE", "AI service is unavailable");
    }
    if (error instanceof AIResponseInvalidError) {
      return errorResponse(502, "AI_RESPONSE_INVALID", "AI response was invalid");
    }
    return errorResponse(500, "INTERNAL_ERROR", "An internal error occurred");
  }
}

export async function ai(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  let task = "unknown";
  let response: HttpResponseInit;

  try {
    const body: unknown = await request.json();
    if (isRecord(body) && typeof body.task === "string") {
      task = isSupportedTask(body.task) ? body.task : "unsupported";
    }
    response = await processAIRequest(body);
  } catch {
    response = errorResponse(400, "INVALID_REQUEST", "Request body must be valid JSON");
  }

  context.log(
    `task=${task} status=${response.status ?? 200} durationMs=${Date.now() - startedAt}`,
  );
  return response;
}

app.http("ai", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ai",
  handler: ai,
});