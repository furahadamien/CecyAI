import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { AIUnavailableError } from "../src/ai/openAIClient";
import { DailyInsightsV2Schema } from "../src/ai/schemas";
import { processAIRequest } from "../src/functions/ai";

interface SuccessFixture {
  fixtureType: "mock_contract";
  headers: Record<string, string>;
  request: unknown;
  response: { success: true; data: unknown };
}

interface ErrorFixture {
  id: string;
  catalogVersion?: 1 | 2;
  request?: unknown;
  simulation?: "AIUnavailableError";
  httpStatus: number;
  retryable?: boolean;
  response: unknown;
}

function load<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "fixtures", "daily-insights-v2", `${name}.json`),
      "utf8",
    ),
  ) as T;
}

for (const name of ["success", "sparse-unknown", "missing-preferences", "safety-refusal"]) {
  test(`${name} daily insights fixture matches the executable contract`, async () => {
    const fixture = load<SuccessFixture>(name);
    assert.equal(fixture.headers["X-Cecy-Symptom-Catalog-Version"], "2");
    assert.equal(DailyInsightsV2Schema.safeParse(fixture.response.data).success, true);

    const response = await processAIRequest(
      fixture.request,
      { dailyInsightsV2: async () => fixture.response.data },
      2,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.jsonBody, fixture.response);
  });
}

test("daily insights error fixtures match controlled runtime envelopes", async () => {
  const fixture = load<{ cases: ErrorFixture[] }>("errors");
  const successRequest = load<SuccessFixture>("success").request;

  for (const errorCase of fixture.cases) {
    const response = await processAIRequest(
      errorCase.request ?? successRequest,
      {
        dailyInsightsV2: async () => {
          if (errorCase.simulation === "AIUnavailableError") {
            throw new AIUnavailableError("synthetic upstream detail");
          }
          throw new Error("unexpected fixture simulation");
        },
      },
      errorCase.catalogVersion ?? 2,
    );

    assert.equal(response.status, errorCase.httpStatus, errorCase.id);
    assert.deepEqual(response.jsonBody, errorCase.response, errorCase.id);
  }
});

test("daily insights response enforces item and text boundaries", () => {
  const base = load<SuccessFixture>("success").response.data as {
    schemaVersion: 2;
    sections: Array<{
      kind: string;
      status: string;
      suggestions: string[];
      unavailableReason: null;
    }>;
    explanation: string;
    safetyMessage: null;
  };
  assert.equal(
    DailyInsightsV2Schema.safeParse({
      ...base,
      sections: [
        {
          ...base.sections[0],
          suggestions: Array.from({ length: 7 }, () => "Suggestion"),
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({
      ...base,
      sections: [{ ...base.sections[0], suggestions: ["x".repeat(201)] }],
    }).success,
    false,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({
      ...base,
      sections: [{ ...base.sections[0], suggestions: ["🙂".repeat(200)] }],
    }).success,
    true,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({
      ...base,
      sections: [{ ...base.sections[0], suggestions: ["🙂".repeat(201)] }],
    }).success,
    false,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({ ...base, explanation: "x".repeat(1_001) }).success,
    false,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({ ...base, explanation: "🙂".repeat(1_000) }).success,
    true,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({ ...base, explanation: "🙂".repeat(1_001) }).success,
    false,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({ ...base, safetyMessage: "🙂".repeat(600) }).success,
    true,
  );
  assert.equal(
    DailyInsightsV2Schema.safeParse({ ...base, safetyMessage: "🙂".repeat(601) }).success,
    false,
  );
});