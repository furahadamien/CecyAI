import { requestStructuredOutput } from "../ai/openAIClient";
import { ExplainInsightSchema, type ExplainInsight } from "../ai/schemas";
import { TASK_INSTRUCTIONS } from "../ai/systemInstructions";

export async function explainInsight(context: unknown): Promise<ExplainInsight> {
  return requestStructuredOutput({
    context,
    instructions: TASK_INSTRUCTIONS.explain_insight,
    schema: ExplainInsightSchema,
    schemaName: "explained_insight",
  });
}