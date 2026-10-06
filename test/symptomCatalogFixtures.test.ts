import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TaskDependencies } from "../src/ai/taskRouter";
import {
  EXPANDED_SYMPTOM_CODES,
  LEGACY_SYMPTOM_CODES,
  type SymptomCatalogVersion,
} from "../src/ai/symptomCatalog";
import { processAIRequest } from "../src/functions/ai";

interface ContractCase {
  task: keyof TaskDependencies;
  request: unknown;
  response: { success: true; data: unknown };
}

interface ContractFixture {
  fixtureType: "mock_contract";
  catalogVersion: SymptomCatalogVersion;
  headers: Record<string, string>;
  cases: ContractCase[];
}

function loadFixture(version: SymptomCatalogVersion): ContractFixture {
  const file = path.join(process.cwd(), "fixtures", "symptom-catalog", `v${version}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as ContractFixture;
}

function dependencyFor(task: keyof TaskDependencies, data: unknown): Partial<TaskDependencies> {
  switch (task) {
    case "normalizeSymptoms":
      return { normalizeSymptoms: async () => data };
    case "explainInsight":
      return { explainInsight: async () => data };
    case "wellnessRecommendation":
      return { wellnessRecommendation: async () => data };
    case "cycleSummary":
      return { cycleSummary: async () => data };
    case "answerCycleQuestion":
      return { answerCycleQuestion: async () => data };
  }
}

const dependencyNames: Record<string, keyof TaskDependencies> = {
  normalize_symptoms: "normalizeSymptoms",
  explain_insight: "explainInsight",
  daily_wellness_recommendation: "wellnessRecommendation",
  cycle_summary: "cycleSummary",
  answer_cycle_question: "answerCycleQuestion",
};

for (const version of [1, 2] as const) {
  test(`v${version} fixtures match the executable request and response contract`, async () => {
    const fixture = loadFixture(version);
    assert.equal(fixture.catalogVersion, version);
    assert.equal(fixture.headers["X-Cecy-Symptom-Catalog-Version"], String(version));
    assert.equal(fixture.cases.length, 5);

    for (const fixtureCase of fixture.cases) {
      const dependencyName = dependencyNames[fixtureCase.task];
      assert.ok(dependencyName);
      const response = await processAIRequest(
        fixtureCase.request,
        dependencyFor(dependencyName, fixtureCase.response.data),
        version,
      );
      assert.equal(response.status, 200, `${fixtureCase.task} fixture must be valid`);
      assert.deepEqual(response.jsonBody, fixtureCase.response);
    }
  });
}

test("catalog mapping fixture exactly matches the executable v2 catalog", () => {
  const file = path.join(
    process.cwd(),
    "fixtures",
    "symptom-catalog",
    "catalog-v2.json",
  );
  const fixture = JSON.parse(readFileSync(file, "utf8")) as {
    entries: Array<{ apiValue: string; status: "existing" | "added" }>;
  };

  assert.equal(fixture.entries.length, 39);
  assert.deepEqual(
    new Set(fixture.entries.map((entry) => entry.apiValue)),
    new Set(EXPANDED_SYMPTOM_CODES),
  );
  assert.equal(fixture.entries.filter((entry) => entry.status === "existing").length, 13);
  assert.equal(fixture.entries.filter((entry) => entry.status === "added").length, 26);
});

test("evaluation fixtures reference only negotiated catalog codes", () => {
  const file = path.join(
    process.cwd(),
    "fixtures",
    "symptom-catalog",
    "evaluation-cases.json",
  );
  const fixture = JSON.parse(readFileSync(file, "utf8")) as {
    recordedLiveModelResults: boolean;
    cases: Array<{
      catalogVersion: SymptomCatalogVersion;
      expectedTypes: string[];
      expectedNullSeverityTypes: string[];
    }>;
  };

  assert.equal(fixture.recordedLiveModelResults, false);
  for (const fixtureCase of fixture.cases) {
    const allowed = new Set(
      fixtureCase.catalogVersion === 1 ? LEGACY_SYMPTOM_CODES : EXPANDED_SYMPTOM_CODES,
    );
    fixtureCase.expectedTypes.forEach((type) => assert.equal(allowed.has(type as never), true));
    fixtureCase.expectedNullSeverityTypes.forEach((type) =>
      assert.equal(fixtureCase.expectedTypes.includes(type), true),
    );
  }
});

test("error fixtures use the stable controlled failure envelope", () => {
  const file = path.join(process.cwd(), "fixtures", "symptom-catalog", "errors.json");
  const fixture = JSON.parse(readFileSync(file, "utf8")) as {
    errors: Array<{
      httpStatus: number;
      response: {
        success: boolean;
        error: { code: string; message: string };
      };
    }>;
  };

  const supportedCodes = new Set([
    "INVALID_REQUEST",
    "UNSUPPORTED_TASK",
    "AI_UNAVAILABLE",
    "AI_RESPONSE_INVALID",
    "INTERNAL_ERROR",
  ]);
  assert.ok(fixture.errors.length > 0);
  fixture.errors.forEach((error) => {
    assert.equal(error.response.success, false);
    assert.equal(supportedCodes.has(error.response.error.code), true);
    assert.ok(error.response.error.message.length > 0);
    assert.ok([400, 500, 502].includes(error.httpStatus));
  });
});