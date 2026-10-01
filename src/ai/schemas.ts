import { z } from "zod";

const shortText = z.string().trim().min(1).max(200);
const mediumText = z.string().trim().min(1).max(1_000);
const safetyMessage = z.string().trim().min(1).max(600).nullable();

export const SYMPTOM_CATEGORIES = [
  "cramps",
  "headache",
  "bloating",
  "fatigue",
  "mood_change",
  "acne",
  "back_pain",
  "breast_tenderness",
  "nausea",
  "cravings",
  "sleep_change",
  "low_energy",
  "digestive_change",
] as const;

export const NormalizedSymptomsSchema = z
  .object({
    symptoms: z.array(
      z
        .object({
          type: z.enum(SYMPTOM_CATEGORIES),
          severity: z.enum(["mild", "moderate", "severe"]).nullable(),
        })
        .strict(),
    ).max(20),
  })
  .strict();

export type NormalizedSymptoms = z.infer<typeof NormalizedSymptomsSchema>;

const FactScalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const FactValueSchema = z.union([
  FactScalarSchema,
  z.array(FactScalarSchema).max(20),
  z.record(z.string().min(1).max(80), FactScalarSchema).refine(
    (value) => Object.keys(value).length <= 20,
    "nested fact objects may contain at most 20 fields",
  ),
]);

export const FactsSchema = z
  .record(z.string().min(1).max(80), FactValueSchema)
  .refine((value) => Object.keys(value).length > 0, "facts must not be empty")
  .refine((value) => Object.keys(value).length <= 40, "facts may contain at most 40 fields");

export const NormalizeSymptomsContextSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const ExplainInsightContextSchema = z
  .object({
    insightType: z.string().trim().min(1).max(100),
    facts: FactsSchema,
  })
  .strict();

export const WellnessSymptomSchema = z
  .object({
    type: z.string().trim().min(1).max(80),
    severity: z.enum(["mild", "moderate", "severe"]).nullable(),
  })
  .strict();

export const DailyWellnessContextSchema = z
  .object({
    cycleDay: z.number().int().min(1).max(100).optional(),
    estimatedPhase: z.string().trim().min(1).max(80).optional(),
    symptoms: z.array(WellnessSymptomSchema).max(20),
    activityLevel: z.string().trim().min(1).max(80),
    preferredExercises: z.array(shortText).max(20),
    dietaryPreference: z.string().trim().min(1).max(100),
    foodAllergies: z.array(shortText).max(20),
    userGoals: z.array(shortText).max(20),
  })
  .strict();

export const CycleSummaryContextSchema = z
  .object({
    periodLabel: z.string().trim().min(1).max(100),
    cycleLength: z.number().int().min(1).max(100),
    averageCycleLength: z.number().min(1).max(100),
    periodLength: z.number().int().min(1).max(30),
    commonSymptoms: z.array(shortText).max(20),
    observations: z.array(z.string().trim().min(1).max(500)).max(30),
  })
  .strict();

export const AnswerCycleQuestionContextSchema = z
  .object({
    question: z.string().trim().min(1).max(1_000),
    facts: FactsSchema,
  })
  .strict();

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