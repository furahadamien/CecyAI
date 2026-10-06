import { z } from "zod";
import {
  isSymptomCode,
  LEGACY_SYMPTOM_CODES,
  symptomCodesForVersion,
  type SymptomCatalogVersion,
} from "./symptomCatalog";

const shortText = z.string().trim().min(1).max(200);
const mediumText = z.string().trim().min(1).max(1_000);
const safetyMessage = z.string().trim().min(1).max(600).nullable();

export const SYMPTOM_CATEGORIES = LEGACY_SYMPTOM_CODES;

export function createNormalizedSymptomsSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      symptoms: z
        .array(
          z
            .object({
              type: z.enum(symptomCodesForVersion(version)),
              severity: z.enum(["mild", "moderate", "severe"]).nullable(),
            })
            .strict()
            .superRefine((symptom, context) => {
              if (
                ["sleep_change", "low_energy", "libido"].includes(symptom.type) &&
                symptom.severity !== null
              ) {
                context.addIssue({
                  code: "custom",
                  message: "rating observations must use null severity",
                  path: ["severity"],
                });
              }
            }),
        )
        .max(version === 1 ? 20 : 39)
        .superRefine((symptoms, context) => {
          const seen = new Set<string>();
          symptoms.forEach((symptom, index) => {
            if (seen.has(symptom.type)) {
              context.addIssue({
                code: "custom",
                message: "normalized symptom types must be unique",
                path: [index, "type"],
              });
            }
            seen.add(symptom.type);
          });
        }),
    })
    .strict();
}

export const NormalizedSymptomsSchema = createNormalizedSymptomsSchema(1);
export type NormalizedSymptoms = z.infer<ReturnType<typeof createNormalizedSymptomsSchema>>;

const FactScalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const FactObjectSchema = z
  .record(z.string().min(1).max(80), FactScalarSchema)
  .refine(
    (value) => Object.keys(value).length <= 20,
    "nested fact objects may contain at most 20 fields",
  );

const FactValueSchema = z.union([
  FactScalarSchema,
  z.array(FactScalarSchema).max(20),
  FactObjectSchema,
  z.array(FactObjectSchema).max(39),
]);

export const FactsSchema = z
  .record(z.string().min(1).max(80), FactValueSchema)
  .refine((value) => Object.keys(value).length > 0, "facts must not be empty")
  .refine((value) => Object.keys(value).length <= 40, "facts may contain at most 40 fields");

function createCatalogFactsSchema(version: SymptomCatalogVersion) {
  return FactsSchema.superRefine((facts, context) => {
    if ("symptom" in facts && !isSymptomCode(facts.symptom, version)) {
      context.addIssue({
        code: "custom",
        message: "symptom is not supported by the requested catalog",
        path: ["symptom"],
      });
    }

    if ("symptoms" in facts) {
      if (!Array.isArray(facts.symptoms)) {
        context.addIssue({
          code: "custom",
          message: "symptoms must be an array",
          path: ["symptoms"],
        });
        return;
      }
      if (facts.symptoms.length > (version === 1 ? 20 : 39)) {
        context.addIssue({
          code: "custom",
          message: `symptoms may contain at most ${version === 1 ? 20 : 39} items`,
          path: ["symptoms"],
        });
      }
      facts.symptoms.forEach((item, index) => {
        if (
          typeof item !== "object" ||
          item === null ||
          Array.isArray(item) ||
          !("symptom" in item) ||
          !isSymptomCode(item.symptom, version)
        ) {
          context.addIssue({
            code: "custom",
            message: "symptom is not supported by the requested catalog",
            path: ["symptoms", index, "symptom"],
          });
        }
      });
    }
  });
}

export const NormalizeSymptomsContextSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export function createExplainInsightContextSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      insightType: z.string().trim().min(1).max(100),
      facts: createCatalogFactsSchema(version),
    })
    .strict();
}

export function createWellnessSymptomSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      type: z.enum(symptomCodesForVersion(version)),
      severity: z.enum(["mild", "moderate", "severe"]).nullable(),
    })
    .strict()
    .superRefine((symptom, context) => {
      if (
        ["sleep_change", "low_energy", "libido"].includes(symptom.type) &&
        symptom.severity !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "rating observations must use null severity",
          path: ["severity"],
        });
      }
    });
}

export function createDailyWellnessContextSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      cycleDay: z.number().int().min(1).max(100).optional(),
      estimatedPhase: z.string().trim().min(1).max(80).optional(),
      symptoms: z.array(createWellnessSymptomSchema(version)).max(version === 1 ? 20 : 39),
      activityLevel: z.string().trim().min(1).max(80),
      preferredExercises: z.array(shortText).max(20),
      dietaryPreference: z.string().trim().min(1).max(100),
      foodAllergies: z.array(shortText).max(20),
      userGoals: z.array(shortText).max(20),
    })
    .strict();
}

export function createCycleSummaryContextSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      periodLabel: z.string().trim().min(1).max(100),
      cycleLength: z.number().int().min(1).max(100),
      averageCycleLength: z.number().min(1).max(100),
      periodLength: z.number().int().min(1).max(30),
      commonSymptoms: z
        .array(z.enum(symptomCodesForVersion(version)))
        .max(version === 1 ? 20 : 39),
      observations: z.array(z.string().trim().min(1).max(500)).max(30),
    })
    .strict();
}

export function createAnswerCycleQuestionContextSchema(version: SymptomCatalogVersion) {
  return z
    .object({
      question: z.string().trim().min(1).max(1_000),
      facts: createCatalogFactsSchema(version),
    })
    .strict();
}

export const ExplainInsightContextSchema = createExplainInsightContextSchema(1);
export const WellnessSymptomSchema = createWellnessSymptomSchema(1);
export const DailyWellnessContextSchema = createDailyWellnessContextSchema(1);
export const CycleSummaryContextSchema = createCycleSummaryContextSchema(1);
export const AnswerCycleQuestionContextSchema = createAnswerCycleQuestionContextSchema(1);

export type ExplainInsightContext = z.infer<ReturnType<typeof createExplainInsightContextSchema>>;
export type DailyWellnessContext = z.infer<ReturnType<typeof createDailyWellnessContextSchema>>;
export type CycleSummaryContext = z.infer<ReturnType<typeof createCycleSummaryContextSchema>>;
export type AnswerCycleQuestionContext = z.infer<
  ReturnType<typeof createAnswerCycleQuestionContextSchema>
>;

export const ExplainInsightSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    explanation: mediumText,
    supportingObservation: z.string().trim().min(1).max(500),
    safetyMessage,
  })
  .strict();

export const DailyWellnessRecommendationSchema = z
  .object({
    movementSuggestions: z.array(shortText).max(6),
    foodSuggestions: z.array(shortText).max(6),
    hydrationSuggestion: z.string().trim().min(1).max(300),
    recoverySuggestions: z.array(shortText).max(6),
    explanation: mediumText,
    safetyMessage,
  })
  .strict();

export const CycleSummarySchema = z
  .object({
    summary: z.string().trim().min(1).max(1_200),
    highlights: z.array(z.string().trim().min(1).max(300)).max(8),
    safetyMessage,
  })
  .strict();

export const CycleQuestionAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(1_200),
    supportingFacts: z.array(z.string().trim().min(1).max(300)).max(8),
    safetyMessage,
  })
  .strict();

export type ExplainInsight = z.infer<typeof ExplainInsightSchema>;
export type DailyWellnessRecommendation = z.infer<typeof DailyWellnessRecommendationSchema>;
export type CycleSummary = z.infer<typeof CycleSummarySchema>;
export type CycleQuestionAnswer = z.infer<typeof CycleQuestionAnswerSchema>;