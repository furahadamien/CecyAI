import type {
  CycleQuestionAnswer,
  CycleSummary,
  DailyWellnessRecommendation,
  ExplainInsight,
  NormalizedSymptoms,
} from "../ai/schemas";

export type AIResponseData =
  | NormalizedSymptoms
  | ExplainInsight
  | DailyWellnessRecommendation
  | CycleSummary
  | CycleQuestionAnswer;

export interface AISuccessResponse {
  success: true;
  data: AIResponseData;
}

export type AIErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_TASK"
  | "AI_UNAVAILABLE"
  | "AI_RESPONSE_INVALID"
  | "INTERNAL_ERROR";

export interface AIErrorResponse {
  success: false;
  error: {
    code: AIErrorCode;
    message: string;
  };
}

export type AIResponse = AISuccessResponse | AIErrorResponse;