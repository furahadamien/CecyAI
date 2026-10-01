import { requestStructuredOutput } from "../ai/openAIClient";
import {
  CycleQuestionAnswerSchema,
  type CycleQuestionAnswer,
} from "../ai/schemas";
import { TASK_INSTRUCTIONS } from "../ai/systemInstructions";

export async function answerCycleQuestion(context: unknown): Promise<CycleQuestionAnswer> {
  return requestStructuredOutput({
    context,
    instructions: TASK_INSTRUCTIONS.answer_cycle_question,
    schema: CycleQuestionAnswerSchema,
    schemaName: "cycle_question_answer",
  });
}