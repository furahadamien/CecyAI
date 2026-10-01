import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { AIUnavailableError } from "../src/ai/openAIClient";
import { ai, processAIRequest } from "../src/functions/ai";

const sampleRequest = {
  task: "normalize_symptoms",
  context: { text: "I'm exhausted, bloated, and my lower back hurts." },
};

const normalizeRequest = {
  task: "normalize_symptoms",
  context: { text: "I'm exhausted, bloated, and my lower back hurts." },
};

test("normalizes a valid symptom request", async () => {
  const response = await processAIRequest(sampleRequest, {
    normalizeSymptoms: async () => ({
      symptoms: [
        { type: "fatigue", severity: "moderate" },
        { type: "bloating", severity: null },
        { type: "back_pain", severity: null },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    success: true,
    data: {
      symptoms: [
        { type: "fatigue", severity: "moderate" },
        { type: "bloating", severity: null },
        { type: "back_pain", severity: null },
      ],
    },
  });
});

test("explains a supplied deterministic insight", async () => {
  const response = await processAIRequest(
    {
      task: "explain_insight",
      context: {
        insightType: "cycle_variability_change",
        facts: {
          previousAverageCycleLength: 28.8,
          recentAverageCycleLength: 31.7,
          previousVariationDays: 2.1,
          recentVariationDays: 4.8,
        },
      },
    },
    {
      explainInsight: async () => ({
        title: "Your recent cycles have been less consistent",
        explanation: "Your supplied recent cycle lengths varied more than the earlier values.",
        supportingObservation: "The recent average was 31.7 days versus 28.8 days previously.",
        safetyMessage: null,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { data: { safetyMessage: null } }).data.safetyMessage, null);
});

test("creates a structured daily wellness recommendation", async () => {
  const response = await processAIRequest(
    {
      task: "daily_wellness_recommendation",
      context: {
        cycleDay: 27,
        estimatedPhase: "late_luteal",
        symptoms: [
          { type: "fatigue", severity: "moderate" },
          { type: "cramps", severity: "mild" },
        ],
        activityLevel: "moderately_active",
        preferredExercises: ["walking", "strength_training"],
        dietaryPreference: "none",
        foodAllergies: [],
        userGoals: ["manage_symptoms", "stay_active"],
      },
    },
    {
      wellnessRecommendation: async () => ({
        movementSuggestions: ["20-minute walk"],
        foodSuggestions: ["Oatmeal with berries and yogurt"],
        hydrationSuggestion: "Drink regularly throughout the day.",
        recoverySuggestions: ["Take extra rest if energy remains low."],
        explanation: "These suggestions prioritize the supplied fatigue and cramps.",
        safetyMessage: null,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.jsonBody as { data: { movementSuggestions: string[] } }).data.movementSuggestions,
    ["20-minute walk"],
  );
});

test("summarizes only supplied cycle statistics", async () => {
  const response = await processAIRequest(
    {
      task: "cycle_summary",
      context: {
        periodLabel: "Last cycle",
        cycleLength: 30,
        averageCycleLength: 29,
        periodLength: 5,
        commonSymptoms: ["cramps", "fatigue"],
        observations: ["fatigue occurred during the three days before the period"],
      },
    },
    {
      cycleSummary: async () => ({
        summary: "The supplied last cycle lasted 30 days and the period lasted five days.",
        highlights: ["Cycle length was close to the supplied recent average."],
        safetyMessage: null,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { data: { highlights: string[] } }).data.highlights.length, 1);
});

test("answers a cycle question from supplied facts", async () => {
  const response = await processAIRequest(
    {
      task: "answer_cycle_question",
      context: {
        question: "Do I usually get headaches before my period?",
        facts: {
          cyclesAnalyzed: 6,
          headachesBeforePeriodCount: 5,
          typicalTimingDaysBeforePeriod: { min: 1, max: 3 },
        },
      },
    },
    {
      answerCycleQuestion: async () => ({
        answer: "You logged headaches before 5 of the 6 supplied periods.",
        supportingFacts: ["Typical timing was 1 to 3 days beforehand."],
        safetyMessage: null,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (response.jsonBody as { data: { supportingFacts: string[] } }).data.supportingFacts[0],
    "Typical timing was 1 to 3 days beforehand.",
  );
});

test("rejects a malformed request", async () => {
  const response = await processAIRequest("not an object");
  assert.equal(response.status, 400);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: { code: "INVALID_REQUEST", message: "task is required" },
  });
});

test("rejects malformed JSON at the HTTP boundary without logging parser details", async () => {
  const logs: string[] = [];
  const request = {
    json: async () => {
      throw new SyntaxError("private parser detail");
    },
  } as unknown as HttpRequest;
  const context = {
    log: (...values: unknown[]) => logs.push(values.join(" ")),
  } as unknown as InvocationContext;

  const response = await ai(request, context);

  assert.equal(response.status, 400);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON" },
  });
  assert.match(logs[0] ?? "", /^task=unknown status=400 durationMs=\d+$/);
  assert.equal(logs.some((entry) => entry.includes("private parser detail")), false);
});

test("rejects an unsupported task", async () => {
  const response = await processAIRequest({ task: "chat", context: {} });
  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: { code: string } }).error.code, "UNSUPPORTED_TASK");
});

test("rejects a missing context", async () => {
  const response = await processAIRequest({ task: "cycle_summary" });
  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: { message: string } }).error.message, "context is required");
});

test("rejects invalid task-specific context", async () => {
  const response = await processAIRequest({
    task: "normalize_symptoms",
    context: { text: "   " },
  });
  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: { code: string } }).error.code, "INVALID_REQUEST");
});

test("rejects excessively large arrays before calling OpenAI", async () => {
  let called = false;
  const response = await processAIRequest(
    {
      task: "cycle_summary",
      context: {
        periodLabel: "Last cycle",
        cycleLength: 30,
        averageCycleLength: 29,
        periodLength: 5,
        commonSymptoms: Array.from({ length: 21 }, (_, index) => `symptom-${index}`),
        observations: [],
      },
    },
    {
      cycleSummary: async () => {
        called = true;
        return {};
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("rejects an oversized request body before calling OpenAI", async () => {
  let called = false;
  const oversizedFacts = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [
      `fact${index}`,
      Object.fromEntries(
        Array.from({ length: 20 }, (_, nestedIndex) => [
          `value${nestedIndex}`,
          "x".repeat(100),
        ]),
      ),
    ]),
  );
  const response = await processAIRequest(
    {
      task: "explain_insight",
      context: { insightType: "example", facts: oversizedFacts },
    },
    {
      explainInsight: async () => {
        called = true;
        return {};
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal(
    (response.jsonBody as { error: { message: string } }).error.message,
    "request body is too large",
  );
});

test("maps an OpenAI request failure without exposing details", async () => {
  const response = await processAIRequest(normalizeRequest, {
    normalizeSymptoms: async () => {
      throw new AIUnavailableError("secret upstream detail");
    },
  });
  assert.equal(response.status, 502);
  assert.deepEqual(response.jsonBody, {
    success: false,
    error: { code: "AI_UNAVAILABLE", message: "AI service is unavailable" },
  });
});

test("rejects an invalid structured OpenAI response", async () => {
  const response = await processAIRequest(normalizeRequest, {
    normalizeSymptoms: async () => ({
      symptoms: [{ type: "made_up_symptom", severity: "extreme" }],
    }),
  });
  assert.equal(response.status, 502);
  assert.equal((response.jsonBody as { error: { code: string } }).error.code, "AI_RESPONSE_INVALID");
});