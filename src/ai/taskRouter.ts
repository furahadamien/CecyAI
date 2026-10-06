import { AIResponseInvalidError } from "./openAIClient";
import {
  CycleQuestionAnswerSchema,
  CycleSummarySchema,
  DailyWellnessRecommendationSchema,
  ExplainInsightSchema,
  createNormalizedSymptomsSchema,
} from "./schemas";
import type { SymptomCatalogVersion } from "./symptomCatalog";
import type { AIRequest } from "../models/AIRequest";
import { answerCycleQuestion } from "../tasks/answerCycleQuestion";
import { cycleSummary } from "../tasks/cycleSummary";
import { explainInsight } from "../tasks/explainInsight";
import { normalizeSymptoms } from "../tasks/normalizeSymptoms";
import { wellnessRecommendation } from "../tasks/wellnessRecommendation";

type TaskHandler = (
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
) => Promise<unknown>;

export interface TaskDependencies {
  normalizeSymptoms: TaskHandler;
  explainInsight: TaskHandler;
  wellnessRecommendation: TaskHandler;
  cycleSummary: TaskHandler;
  answerCycleQuestion: TaskHandler;
}

const defaultDependencies: TaskDependencies = {
  normalizeSymptoms,
  explainInsight,
  wellnessRecommendation,
  cycleSummary,
  answerCycleQuestion,
};

export async function routeTask(
  request: AIRequest,
  overrides: Partial<TaskDependencies> = {},
): Promise<unknown> {
  const dependencies = { ...defaultDependencies, ...overrides };
  let output: unknown;
  let result;

  switch (request.task) {
    case "normalize_symptoms":
      output = await dependencies.normalizeSymptoms(request.context, request.catalogVersion);
      result = createNormalizedSymptomsSchema(request.catalogVersion).safeParse(output);
      break;
    case "explain_insight":
      output = await dependencies.explainInsight(request.context, request.catalogVersion);
      result = ExplainInsightSchema.safeParse(output);
      break;
    case "daily_wellness_recommendation":
      output = await dependencies.wellnessRecommendation(request.context, request.catalogVersion);
      result = DailyWellnessRecommendationSchema.safeParse(output);
      break;
    case "cycle_summary":
      output = await dependencies.cycleSummary(request.context, request.catalogVersion);
      result = CycleSummarySchema.safeParse(output);
      break;
    case "answer_cycle_question":
      output = await dependencies.answerCycleQuestion(request.context, request.catalogVersion);
      result = CycleQuestionAnswerSchema.safeParse(output);
      break;
  }

  if (!result.success) {
    throw new AIResponseInvalidError("OpenAI returned an invalid response");
  }
  return result.data;
}