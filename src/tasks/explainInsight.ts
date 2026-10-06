import { requestStructuredOutput } from "../ai/openAIClient";
import { ExplainInsightSchema, type ExplainInsight } from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function explainInsight(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<ExplainInsight> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("explain_insight", catalogVersion),
    schema: ExplainInsightSchema,
    schemaName: `explained_insight_v${catalogVersion}`,
  });
}