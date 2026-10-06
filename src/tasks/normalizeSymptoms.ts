import { requestStructuredOutput } from "../ai/openAIClient";
import {
  createNormalizedSymptomsSchema,
  type NormalizedSymptoms,
} from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function normalizeSymptoms(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<NormalizedSymptoms> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("normalize_symptoms", catalogVersion),
    schema: createNormalizedSymptomsSchema(catalogVersion),
    schemaName: `normalized_symptoms_v${catalogVersion}`,
  });
}