import type {
  AnswerCycleQuestionContext,
  CycleSummaryContext,
  DailyWellnessContext,
  ExplainInsightContext,
} from "../ai/schemas";
import type { SymptomCatalogVersion } from "../ai/symptomCatalog";

type BaseAIRequest = { catalogVersion: SymptomCatalogVersion };

export type AIRequest =
  | (BaseAIRequest & { task: "normalize_symptoms"; context: { text: string } })
  | (BaseAIRequest & { task: "explain_insight"; context: ExplainInsightContext })
  | {
      catalogVersion: SymptomCatalogVersion;
      task: "daily_wellness_recommendation";
      context: DailyWellnessContext;
    }
  | (BaseAIRequest & { task: "cycle_summary"; context: CycleSummaryContext })
  | {
      catalogVersion: SymptomCatalogVersion;
      task: "answer_cycle_question";
      context: AnswerCycleQuestionContext;
    };