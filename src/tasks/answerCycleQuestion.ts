import { requestStructuredOutput } from "../ai/openAIClient";
import {
  CycleQuestionAnswerSchema,
  type CycleQuestionAnswer,
} from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";
import { taskInstructionsFor } from "../ai/systemInstructions";

export async function answerCycleQuestion(
  context: unknown,
  catalogVersion: SymptomCatalogVersion,
): Promise<CycleQuestionAnswer> {
  return requestStructuredOutput({
    context,
    instructions: taskInstructionsFor("answer_cycle_question", catalogVersion),
    schema: CycleQuestionAnswerSchema,
    schemaName: `cycle_question_answer_v${catalogVersion}`,
  });
}