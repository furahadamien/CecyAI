import { z } from "zod";
import {
  AnswerCycleQuestionContextSchema,
  CycleSummaryContextSchema,
  DailyWellnessContextSchema,
  ExplainInsightContextSchema,
  NormalizeSymptomsContextSchema,
} from "../ai/schemas";

export type AIRequest =
  | { task: "normalize_symptoms"; context: z.infer<typeof NormalizeSymptomsContextSchema> }
  | { task: "explain_insight"; context: z.infer<typeof ExplainInsightContextSchema> }
  | {
      task: "daily_wellness_recommendation";
      context: z.infer<typeof DailyWellnessContextSchema>;
    }
  | { task: "cycle_summary"; context: z.infer<typeof CycleSummaryContextSchema> }
  | {
      task: "answer_cycle_question";
      context: z.infer<typeof AnswerCycleQuestionContextSchema>;
    };