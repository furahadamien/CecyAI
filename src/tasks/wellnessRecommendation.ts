import { requestStructuredOutput } from "../ai/openAIClient";
import {
  DailyWellnessRecommendationSchema,
  type DailyWellnessRecommendation,
} from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function wellnessRecommendation(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<DailyWellnessRecommendation> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("daily_wellness_recommendation", catalogVersion),
    schema: DailyWellnessRecommendationSchema,
    schemaName: `daily_wellness_recommendation_v${catalogVersion}`,
  });
}