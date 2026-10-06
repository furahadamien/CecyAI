import { requestStructuredOutput } from "../ai/openAIClient";
import { CycleSummarySchema, type CycleSummary } from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function cycleSummary(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<CycleSummary> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("cycle_summary", catalogVersion),
    schema: CycleSummarySchema,
    schemaName: `cycle_summary_v${catalogVersion}`,
  });
}