import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { createNormalizedSymptomsSchema } from "../src/ai/schemas";
import {
  EXPANDED_SYMPTOM_CODES,
  LEGACY_SYMPTOM_CODES,
  SYMPTOM_CATALOG_HEADER,
  parseSymptomCatalogVersion,
} from "../src/ai/symptomCatalog";
import { ai, processAIRequest } from "../src/functions/ai";
import { validateAIRequest } from "../src/validation/requestValidation";

const additions = EXPANDED_SYMPTOM_CODES.filter(
  (code) => !(LEGACY_SYMPTOM_CODES as readonly string[]).includes(code),
);

test("defines 13 legacy codes and 39 unique expanded codes", () => {
  assert.equal(LEGACY_SYMPTOM_CODES.length, 13);
  assert.equal(EXPANDED_SYMPTOM_CODES.length, 39);
  assert.equal(new Set(EXPANDED_SYMPTOM_CODES).size, 39);
  assert.deepEqual(EXPANDED_SYMPTOM_CODES.slice(0, 13), LEGACY_SYMPTOM_CODES);
});

test("defaults missing catalog negotiation to v1 and accepts explicit versions", () => {
  assert.deepEqual(parseSymptomCatalogVersion(undefined), { success: true, version: 1 });
  assert.deepEqual(parseSymptomCatalogVersion(null), { success: true, version: 1 });
  assert.deepEqual(parseSymptomCatalogVersion("1"), { success: true, version: 1 });
  assert.deepEqual(parseSymptomCatalogVersion("2"), { success: true, version: 2 });
  assert.equal(parseSymptomCatalogVersion(" 2 ").success, false);
  assert.equal(parseSymptomCatalogVersion("3").success, false);
});

test("rejects an unsupported catalog header before parsing the body", async () => {
  let parsedBody = false;
  const request = {
    headers: new Headers([[SYMPTOM_CATALOG_HEADER, "3"]]),
    json: async () => {
      parsedBody = true;
      return {};
    },
  } as unknown as HttpRequest;
  const context = { log: () => undefined } as unknown as InvocationContext;

  const response = await ai(request, context);

  assert.equal(response.status, 400);
  assert.equal(parsedBody, false);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: {
      code: "INVALID_REQUEST",
      message: `${SYMPTOM_CATALOG_HEADER} must be 1 or 2`,
    },
  });
});

test("passes an explicit v2 HTTP header through to the task handler", async () => {
  const request = {
    headers: new Headers([[SYMPTOM_CATALOG_HEADER, "2"]]),
    json: async () => ({
      task: "normalize_symptoms",
      context: { text: "I feel dizzy" },
    }),
  } as unknown as HttpRequest;
  const context = { log: () => undefined } as unknown as InvocationContext;
  let receivedVersion: number | undefined;

  const response = await ai(request, context, {
    normalizeSymptoms: async (_requestContext, version) => {
      receivedVersion = version;
      return { symptoms: [{ type: "dizziness", severity: null }] };
    },
  });

  assert.equal(receivedVersion, 2);
  assert.equal(response.status, 200);
});

test("v1 never returns v2-only normalized symptom codes", async () => {
  const response = await processAIRequest(
    { task: "normalize_symptoms", context: { text: "I feel dizzy" } },
    {
      normalizeSymptoms: async () => ({
        symptoms: [{ type: "dizziness", severity: null }],
      }),
    },
  );

  assert.equal(response.status, 502);
  assert.equal((response.jsonBody as { error: { code: string } }).error.code, "AI_RESPONSE_INVALID");
});

test("v2 accepts every added normalized symptom code", async () => {
  const response = await processAIRequest(
    { task: "normalize_symptoms", context: { text: "Synthetic catalog fixture" } },
    {
      normalizeSymptoms: async (_context, version) => {
        assert.equal(version, 2);
        return { symptoms: additions.map((type) => ({ type, severity: null })) };
      },
    },
    2,
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { data: { symptoms: unknown[] } }).data.symptoms.length, 26);
});

test("normalization permits 39 unique v2 types and rejects duplicates", () => {
  const schema = createNormalizedSymptomsSchema(2);
  assert.equal(
    schema.safeParse({
      symptoms: EXPANDED_SYMPTOM_CODES.map((type) => ({ type, severity: null })),
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      symptoms: [
        { type: "cramps", severity: null },
        { type: "cramps", severity: "mild" },
      ],
    }).success,
    false,
  );
});

test("normalization requires null severity for rating observations", () => {
  const schema = createNormalizedSymptomsSchema(2);
  for (const type of ["sleep_change", "low_energy", "libido"] as const) {
    assert.equal(schema.safeParse({ symptoms: [{ type, severity: null }] }).success, true);
    assert.equal(schema.safeParse({ symptoms: [{ type, severity: "severe" }] }).success, false);
  }
});

test("v2 accepts all 39 codes in wellness and cycle summaries", () => {
  const wellness = validateAIRequest(
    {
      task: "daily_wellness_recommendation",
      context: {
        symptoms: EXPANDED_SYMPTOM_CODES.map((type) => ({ type, severity: null })),
        activityLevel: "moderately_active",
        preferredExercises: [],
        dietaryPreference: "none",
        foodAllergies: [],
        userGoals: [],
      },
    },
    2,
  );
  const summary = validateAIRequest(
    {
      task: "cycle_summary",
      context: {
        periodLabel: "Synthetic cycle",
        cycleLength: 30,
        averageCycleLength: 29,
        periodLength: 5,
        commonSymptoms: EXPANDED_SYMPTOM_CODES,
        observations: [],
      },
    },
    2,
  );

  assert.equal(wellness.success, true);
  assert.equal(summary.success, true);
});

test("v2 accepts all codes in insight and single or multi-symptom question facts", () => {
  for (const symptom of EXPANDED_SYMPTOM_CODES) {
    assert.equal(
      validateAIRequest(
        {
          task: "explain_insight",
          context: { insightType: "symptom_timing", facts: { symptom, count: 2 } },
        },
        2,
      ).success,
      true,
    );
    assert.equal(
      validateAIRequest(
        {
          task: "answer_cycle_question",
          context: { question: "What do the supplied records show?", facts: { symptom } },
        },
        2,
      ).success,
      true,
    );
  }

  assert.equal(
    validateAIRequest(
      {
        task: "answer_cycle_question",
        context: {
          question: "Which supplied symptoms were common?",
          facts: {
            symptoms: EXPANDED_SYMPTOM_CODES.map((symptom) => ({ symptom, count: 1 })),
          },
        },
      },
      2,
    ).success,
    true,
  );
});

test("v1 rejects v2-only codes in every symptom-bearing request shape", () => {
  const contexts = [
    {
      task: "explain_insight",
      context: { insightType: "symptom_timing", facts: { symptom: "dizziness" } },
    },
    {
      task: "daily_wellness_recommendation",
      context: {
        symptoms: [{ type: "dizziness", severity: null }],
        activityLevel: "moderately_active",
        preferredExercises: [],
        dietaryPreference: "none",
        foodAllergies: [],
        userGoals: [],
      },
    },
    {
      task: "cycle_summary",
      context: {
        periodLabel: "Synthetic cycle",
        cycleLength: 30,
        averageCycleLength: 29,
        periodLength: 5,
        commonSymptoms: ["dizziness"],
        observations: [],
      },
    },
    {
      task: "answer_cycle_question",
      context: { question: "What was supplied?", facts: { symptom: "dizziness" } },
    },
    {
      task: "answer_cycle_question",
      context: {
        question: "What was supplied?",
        facts: { symptoms: [{ symptom: "dizziness", count: 1 }] },
      },
    },
  ];

  contexts.forEach((request) => assert.equal(validateAIRequest(request).success, false));
});

test("normalization text limits use Unicode code points", () => {
  assert.equal(
    validateAIRequest({
      task: "normalize_symptoms",
      context: { text: "🙂".repeat(2_000) },
    }).success,
    true,
  );
  assert.equal(
    validateAIRequest({
      task: "normalize_symptoms",
      context: { text: "🙂".repeat(2_001) },
    }).success,
    false,
  );
  assert.equal(
    validateAIRequest({
      task: "normalize_symptoms",
      context: { text: "e\u0301".repeat(1_000) },
    }).success,
    true,
  );
  assert.equal(
    validateAIRequest({
      task: "normalize_symptoms",
      context: { text: "e\u0301".repeat(1_001) },
    }).success,
    false,
  );
});