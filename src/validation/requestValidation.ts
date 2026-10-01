import {
  AnswerCycleQuestionContextSchema,
  CycleSummaryContextSchema,
  DailyWellnessContextSchema,
  ExplainInsightContextSchema,
  NormalizeSymptomsContextSchema,
} from "../ai/schemas";
import type { AITaskName } from "../ai/systemInstructions";
import type { AIRequest } from "../models/AIRequest";

const MAX_REQUEST_BYTES = 32 * 1_024;

export const SUPPORTED_TASKS: readonly AITaskName[] = [
  "normalize_symptoms",
  "explain_insight",
  "daily_wellness_recommendation",
  "cycle_summary",
  "answer_cycle_question",
];

type ValidationResult =
  | { success: true; data: AIRequest }
  | {
      success: false;
      code: "INVALID_REQUEST" | "UNSUPPORTED_TASK";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSupportedTask(value: unknown): value is AITaskName {
  return typeof value === "string" && SUPPORTED_TASKS.includes(value as AITaskName);
}

function invalidContext(task: AITaskName, issuePath: PropertyKey[]): ValidationResult {
  const field = issuePath.length > 0 ? `context.${issuePath.join(".")}` : "context";
  return {
    success: false,
    code: "INVALID_REQUEST",
    message: `${field} is invalid for task ${task}`,
  };
}

export function validateAIRequest(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return { success: false, code: "INVALID_REQUEST", message: "task is required" };
  }

  try {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES) {
      return { success: false, code: "INVALID_REQUEST", message: "request body is too large" };
    }
  } catch {
    return { success: false, code: "INVALID_REQUEST", message: "request body is invalid" };
  }

  if (!("task" in body)) {
    return { success: false, code: "INVALID_REQUEST", message: "task is required" };
  }

  if (!isSupportedTask(body.task)) {
    return { success: false, code: "UNSUPPORTED_TASK", message: "task is not supported" };
  }

  if (!isRecord(body.context)) {
    return { success: false, code: "INVALID_REQUEST", message: "context is required" };
  }

  switch (body.task) {
    case "normalize_symptoms": {
      const result = NormalizeSymptomsContextSchema.safeParse(body.context);
      return result.success
        ? { success: true, data: { task: body.task, context: result.data } }
        : invalidContext(body.task, result.error.issues[0]?.path ?? []);
    }
    case "explain_insight": {
      const result = ExplainInsightContextSchema.safeParse(body.context);
      return result.success
        ? { success: true, data: { task: body.task, context: result.data } }
        : invalidContext(body.task, result.error.issues[0]?.path ?? []);
    }
    case "daily_wellness_recommendation": {
      const result = DailyWellnessContextSchema.safeParse(body.context);
      return result.success
        ? { success: true, data: { task: body.task, context: result.data } }
        : invalidContext(body.task, result.error.issues[0]?.path ?? []);
    }
    case "cycle_summary": {
      const result = CycleSummaryContextSchema.safeParse(body.context);
      return result.success
        ? { success: true, data: { task: body.task, context: result.data } }
        : invalidContext(body.task, result.error.issues[0]?.path ?? []);
    }
    case "answer_cycle_question": {
      const result = AnswerCycleQuestionContextSchema.safeParse(body.context);
      return result.success
        ? { success: true, data: { task: body.task, context: result.data } }
        : invalidContext(body.task, result.error.issues[0]?.path ?? []);
    }
  }
}