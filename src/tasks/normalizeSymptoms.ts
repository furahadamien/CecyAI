import { requestStructuredOutput } from "../ai/openAIClient";
import {
  NormalizedSymptomsSchema,
  type NormalizedSymptoms,
} from "../ai/schemas";
import { TASK_INSTRUCTIONS } from "../ai/systemInstructions";

export async function normalizeSymptoms(context: unknown): Promise<NormalizedSymptoms> {
  return requestStructuredOutput({
    context,
    instructions: TASK_INSTRUCTIONS.normalize_symptoms,
    schema: NormalizedSymptomsSchema,
    schemaName: "normalized_symptoms",
  });
}