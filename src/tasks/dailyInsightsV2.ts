import { requestStructuredOutput } from "../ai/openAIClient";
import { DailyInsightsV2Schema, type DailyInsightsV2 } from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function dailyInsightsV2(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<DailyInsightsV2> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("daily_insights_v2", catalogVersion),
    schema: DailyInsightsV2Schema,
    schemaName: "daily_insights_v2",
    maxRetries: 0,
  });
}