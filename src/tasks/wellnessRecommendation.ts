import { requestStructuredOutput } from "../ai/openAIClient";
import {
  DailyWellnessRecommendationSchema,
  type DailyWellnessRecommendation,
} from "../ai/schemas";
import { TASK_INSTRUCTIONS } from "../ai/systemInstructions";

export async function wellnessRecommendation(
  context: unknown,
): Promise<DailyWellnessRecommendation> {
  return requestStructuredOutput({
    context,
    instructions: TASK_INSTRUCTIONS.daily_wellness_recommendation,
    schema: DailyWellnessRecommendationSchema,
    schemaName: "daily_wellness_recommendation",
  });
}