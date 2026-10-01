import { requestStructuredOutput } from "../ai/openAIClient";
import { CycleSummarySchema, type CycleSummary } from "../ai/schemas";
import { TASK_INSTRUCTIONS } from "../ai/systemInstructions";

export async function cycleSummary(context: unknown): Promise<CycleSummary> {
  return requestStructuredOutput({
    context,
    instructions: TASK_INSTRUCTIONS.cycle_summary,
    schema: CycleSummarySchema,
    schemaName: "cycle_summary",
  });
}