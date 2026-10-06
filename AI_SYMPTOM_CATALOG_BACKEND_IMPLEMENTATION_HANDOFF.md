# Cecy Expanded AI Symptom Catalog: Backend Implementation Handoff

Date: October 6, 2026  
Audience: Cecy iOS implementation agent and backend maintainers

## A. Implementation Identity and Scope

- Repository: `/Users/furahadamien/Dev/CecyAI`
- Branch: `feature/expanded-symptom-catalog`
- Base implementation commit: `e41fd57b5c32710eb16a97d6b12d989dbb477e98`
- Deployed implementation revision: `44af85ec5675389142bc77aa97b7bc47196f1871`
- Relevant commits: `Add versioned expanded symptom catalog`, `Clarify libido normalization semantics`
- PR: not created
- Push state: pushed to `origin/feature/expanded-symptom-catalog`
- Deployment state: deployed to production and verified on October 6, 2026
- Implementation owner: GitHub Copilot working with the repository owner

Implemented:

- Optional `X-Cecy-Symptom-Catalog-Version` negotiation on the existing `POST /api/ai` route.
- Legacy v1 default with the existing 13 API codes.
- Opt-in v2 with all 39 requested API codes.
- Catalog-aware request validation for all five tasks.
- Version-specific normalization model schemas and final server response validation.
- Version-aware prompts with negation, overlap, prompt-injection, rating, and safety semantics.
- Multi-symptom question facts, which the previous facts schema could not represent.
- Machine-readable mappings, v1/v2 examples, error envelopes, and synthetic evaluation inputs.
- Automated compatibility, schema, routing, Unicode, fixture, and HTTP negotiation tests.

Deliberately unchanged:

- Route, success/error envelopes, task names, and non-normalization result structures.
- OpenAI provider integration, configured model selection, timeout, retries, and output-token budget.
- Anonymous authorization and current lack of application rate limiting.
- Local iOS symptom storage identifiers and manual/offline behavior.
- Health-data persistence: this change adds none.
- User activity registry behavior and storage.

Deferred or blocked:

- Provider retention configuration and Azure/Application Insights telemetry retention were not independently verified.
- Authentication, quotas, raw-body edge limits, and abuse controls remain separate operational work.

Relevant implementation:

- `src/ai/symptomCatalog.ts`: authoritative v1/v2 wire catalogs and header parsing.
- `src/ai/schemas.ts`: catalog-aware request and normalization schemas.
- `src/validation/requestValidation.ts`: task validation and version propagation.
- `src/functions/ai.ts`: HTTP header negotiation and controlled errors.
- `src/ai/taskRouter.ts`: version-aware dispatch and final response validation.
- `src/ai/systemInstructions.ts`: safety and versioned catalog semantics.
- `src/tasks/*.ts`: version-aware prompts and schema names.
- `fixtures/symptom-catalog/`: iOS integration and evaluation fixtures.
- `test/symptomCatalog.test.ts`: catalog contract tests.
- `test/symptomCatalogFixtures.test.ts`: executable fixture tests.

## B. Authoritative Final Contract

### Endpoint and negotiation

- Production URL after an approved deployment: `https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai`
- Local URL: `http://localhost:7071/api/ai`
- Method: `POST`
- Required header: `Content-Type: application/json`
- Optional header: `X-Cecy-Symptom-Catalog-Version`
- Allowed values: exact string `1` or `2`
- Missing header: v1
- Whitespace-padded, malformed, or unsupported value: HTTP `400`, `INVALID_REQUEST`
- Header names are case-insensitive under HTTP semantics; header values are not trimmed.
- This header is compatibility negotiation, not authentication.

Invalid version response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "X-Cecy-Symptom-Catalog-Version must be 1 or 2"
  }
}
```

### Catalogs

V1 codes, unchanged:

```text
cramps, headache, bloating, fatigue, mood_change, acne, back_pain,
breast_tenderness, nausea, cravings, sleep_change, low_energy,
digestive_change
```

V2 adds these 26 codes:

```text
pelvic_pain, joint_pain, muscle_aches, breast_swelling,
anxiety, irritability, low_mood, mood_swings,
difficulty_concentrating, brain_fog, insomnia, dizziness,
constipation, diarrhea, appetite_changes, vomiting,
oily_skin, dry_skin, hair_changes,
hot_flashes, night_sweats, discharge_changes, vaginal_dryness,
vaginal_itching, urinary_discomfort, libido
```

The complete exact display-name, iOS storage identifier, wire value, category, and existing/added mapping is machine-readable at `fixtures/symptom-catalog/catalog-v2.json`. It contains 39 unique entries: 13 existing and 26 added. There are no deviations from the requested mapping.

Categories are metadata only. They do not appear in API requests or responses and do not alter validation.

### Common envelopes

Success contains `success: true` and `data`; it omits `error`:

```json
{
  "success": true,
  "data": {}
}
```

Failure contains `success: false` and `error`; it omits `data`:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "context is required"
  }
}
```

Task context and model output objects reject extra fields. Unknown top-level request fields remain ignored for backward compatibility.

### Task request constraints

All request bodies are limited to 32 KiB after parsed JSON is canonicalized with `JSON.stringify()`. This is not a raw HTTP-body limit.

`normalize_symptoms`:

- `context.text`: required trimmed string, 1 to 2,000 Unicode code points.
- V1 output: only v1 codes, unique types, at most 20 array items. Because v1 has 13 codes and duplicates are forbidden, the effective valid maximum is 13.
- V2 output: only v2 codes, unique types, at most 39 array items.
- Each item requires `type` and `severity`.
- Severity is `mild`, `moderate`, `severe`, or explicit JSON `null`.
- `sleep_change`, `low_energy`, and `libido` require `severity: null`.
- An empty `symptoms` array is valid.

`explain_insight`:

- `context.insightType`: 1 to 100 Unicode code points.
- `context.facts`: 1 to 40 keys; keys are 1 to 80 code points.
- String fact values: at most 500 code points.
- Scalar arrays and nested scalar objects: at most 20 values/fields.
- Object arrays: at most 39 objects.
- If `facts.symptom` is present, its value must be allowed by the negotiated catalog.

`daily_wellness_recommendation`:

- Optional `cycleDay`: integer 1 through 100.
- Optional `estimatedPhase`: 1 to 80 code points.
- `symptoms`: at most 20 in v1 and 39 in v2.
- Every symptom type must be in the negotiated catalog.
- `sleep_change`, `low_energy`, and `libido` require null severity.
- `activityLevel`: 1 to 80 code points.
- `dietaryPreference`: 1 to 100 code points.
- `preferredExercises`, `foodAllergies`, `userGoals`: at most 20 strings each; each string is 1 to 200 code points.

`cycle_summary`:

- `periodLabel`: 1 to 100 code points.
- `cycleLength`: integer 1 through 100.
- `averageCycleLength`: finite number 1 through 100.
- `periodLength`: integer 1 through 30.
- `commonSymptoms`: negotiated symptom codes; at most 20 in v1 and 39 in v2.
- `observations`: at most 30 strings; each string is 1 to 500 code points.

`answer_cycle_question`:

- `question`: 1 to 1,000 Unicode code points. The current iOS client independently enforces 100 Swift characters.
- `facts`: same bounded facts structure as `explain_insight`.
- `facts.symptom`, when present, must be a negotiated symptom code.
- `facts.symptoms`, when present, must be an array of objects with a negotiated `symptom` field.
- `facts.symptoms`: at most 20 items in v1 and 39 in v2.
- Cycle-only and sparse facts remain valid; unknown measurements should be omitted, not sent as zero.

Zod 4 validation was tested with emoji and combining sequences. Backend string limits count Unicode code points. Swift `String.count` counts extended grapheme clusters, so the iOS bound can differ for combining sequences. The encoded client request limit remains the stronger final client-side transport guard.

### Response constraints

`normalize_symptoms.data`:

- Required `symptoms` array with the versioned constraints above.

`explain_insight.data`:

- `title`: required, 1 to 160 code points.
- `explanation`: required, 1 to 1,000 code points.
- `supportingObservation`: required, 1 to 500 code points.
- `safetyMessage`: required, nullable, otherwise 1 to 600 code points.

`daily_wellness_recommendation.data`:

- `movementSuggestions`, `foodSuggestions`, `recoverySuggestions`: required arrays, at most 6 items, each 1 to 200 code points.
- `hydrationSuggestion`: required, 1 to 300 code points.
- `explanation`: required, 1 to 1,000 code points.
- `safetyMessage`: required and nullable, otherwise 1 to 600 code points.

`cycle_summary.data`:

- `summary`: required, 1 to 1,200 code points.
- `highlights`: required array, at most 8 items, each 1 to 300 code points.
- `safetyMessage`: required and nullable, otherwise 1 to 600 code points.

`answer_cycle_question.data`:

- `answer`: required, 1 to 1,200 code points.
- `supportingFacts`: required array, at most 8 items, each 1 to 300 code points.
- `safetyMessage`: required and nullable, otherwise 1 to 600 code points.

The current iOS limits of 20 summary highlights/supporting facts are looser than the backend's actual maximum of 8.

### Rating semantics

- Most symptom codes may carry model-suggested mild/moderate/severe values only when wording supports the suggestion.
- `sleep_change` is a sleep-quality rating observation and always has null severity.
- `low_energy` means an explicitly low energy rating. Typical or high energy must not map to `low_energy`. It always has null severity.
- `libido` is a sex-drive rating observation and always has null severity.
- In wellness contexts, `libido` represents an explicitly low local rating only.
- Generic normalization may return `sleep_change` or `libido` for other stated ratings, with null severity, for explicit user review.
- `insomnia` means reported difficulty sleeping, not a diagnosed insomnia disorder.
- A specific symptom does not automatically imply its umbrella code.
- The model receives client-supplied aggregates and must not derive timing, ratings, or statistical facts independently.

### Errors

| Condition | HTTP | Code |
| --- | ---: | --- |
| Invalid JSON, version, task context, enum, or limit | 400 | `INVALID_REQUEST` |
| Unknown task | 400 | `UNSUPPORTED_TASK` |
| OpenAI outage, SDK timeout, connection failure, or provider rate limit | 502 | `AI_UNAVAILABLE` |
| Model output violates the selected schema | 502 | `AI_RESPONSE_INVALID` |
| Unexpected internal failure | 500 | `INTERNAL_ERROR` |

Messages are controlled and do not expose provider responses, credentials, stack traces, or internal exception details. Exact examples are in `fixtures/symptom-catalog/errors.json`.

## C. Synthetic Fixture Package

All fixtures are synthetic and contain no credentials, tokens, real notes, or real user records.

- `fixtures/symptom-catalog/v1.json`: all five valid v1 requests and successful responses, including the header separately.
- `fixtures/symptom-catalog/v2.json`: all five valid v2 requests and successful responses, including rating nullability and single/multi-symptom facts.
- `fixtures/symptom-catalog/catalog-v2.json`: exact 39-entry iOS-to-wire mapping.
- `fixtures/symptom-catalog/errors.json`: exact invalid-version, unsupported-task, unknown-type, malformed-output, provider-rate-limit, timeout, and oversized-request envelopes.
- `fixtures/symptom-catalog/evaluation-cases.json`: all 13 legacy and all 26 added types plus negation, specific-versus-umbrella, low/high rating, empty-result, and adversarial-text cases.

The v1/v2 request-response fixtures are executed against request and final response validation in automated tests. Evaluation cases are marked `recordedLiveModelResults: false`; they define expected outcomes for a later approved live-model evaluation and are not evidence of current model behavior.

## D. Runtime, Privacy, and Security

- Provider: OpenAI Responses API through the official Node SDK.
- Production model setting verified October 6, 2026: `OPENAI_MODEL=gpt-6-luna`.
- Model selection remains environment-controlled; it is not hardcoded in this change.
- Prompt/schema revision: deployed commit `44af85ec5675389142bc77aa97b7bc47196f1871`.
- Maximum model output: 1,200 tokens.
- SDK timeout: 20 seconds.
- SDK retries: at most 2 under the SDK policy.
- Provider timeout/rate-limit failures are currently collapsed to HTTP 502 `AI_UNAVAILABLE`.
- Client cancellation does not guarantee immediate cancellation of provider work.
- Function authorization: anonymous.
- Application quotas/rate limiting: none.
- Raw request-body edge limit: not enforced by application code; only the parsed canonicalized 32 KiB guard is present.

Security review found no regression introduced by catalog v2. Two inherited production risks remain:

1. Anonymous callers can consume paid model capacity without a quota.
2. Large whitespace-heavy JSON is parsed before the canonicalized-size check.

Application logs include only allowlisted task, status, and duration. They do not intentionally log raw text, questions, symptom arrays, request/response bodies, or provider errors. Azure platform and Application Insights telemetry must be reviewed separately.

This change adds no health-data persistence, database, cache, queue, telemetry destination, or downstream provider. Accepted context continues to be sent to OpenAI. OpenAI account-level retention and data controls were not verified during this task and must not be described as zero retention without evidence.

Required setting names and purposes:

- `OPENAI_API_KEY`: OpenAI authentication; secret Azure app setting.
- `OPENAI_MODEL`: selected model identifier.
- `APP_ENVIRONMENT`: required environment marker.
- `AzureWebJobsStorage`: Azure Functions host/storage configuration and existing user registry fallback; not introduced by this work.

No secret values are present in code, fixtures, or this handoff.

## E. Validation Evidence

Environment on October 6, 2026:

- macOS
- Node.js `v22.13.0`
- npm `10.9.2`
- Tested and deployed commit: `44af85ec5675389142bc77aa97b7bc47196f1871`

Commands and results:

```text
npm test              41 passed, 0 failed
git diff --check      passed
npm audit --omit=dev  0 vulnerabilities
```

Automated tests use mocked task handlers. Separate production verification used only checked-in synthetic fixtures against the deployed endpoint and configured model. Code review found no blocking code issue after fixes. Security review found no introduced security regression.

Production verification on October 6, 2026:

- All five v1 fixture requests returned HTTP 200 and schema-valid responses.
- All five v2 fixture requests returned HTTP 200 and schema-valid responses.
- Invalid catalog version returned HTTP 400 `INVALID_REQUEST`.
- A headerless dizziness request returned an empty v1 result and did not leak a v2 code.
- All 11 normalization evaluation cases passed after the libido prompt correction, covering all 39 codes, negation, specific-versus-umbrella behavior, low/high ratings, empty output, and adversarial text.
- The severe-vomiting/peanut-allergy wellness fixture returned a non-null safety message with no detected peanut recommendation conflict.
- Azure rediscovered `ai`, `upsertUser`, and `deactivateUser`; the Function host reported `Running`.

Acceptance classification:

| Criterion | Result | Evidence and next action |
| --- | --- | --- |
| CAT-01 Exact catalog | PASS | 13/39 counts, uniqueness, unchanged prefix, and exact mapping fixture are tested. |
| CAT-02 Compatibility | PASS | Missing/explicit v1 and explicit v2 are tested; invalid versions fail; v1 rejects v2 request and response codes. |
| CAT-03 Five operations | PASS | All 39 codes are accepted in each applicable validated field; cycle-only shapes remain supported; all task fixtures execute. |
| CAT-04 Normalization | PASS | Empty arrays, uniqueness, nullable severity, versioned enums, 20/39 schema bounds, and malformed output rejection are implemented. |
| CAT-05 Meaning | PASS | All 11 synthetic normalization evaluation cases passed against the deployed model, including all codes, negation, overlap, rating semantics, empty output, and adversarial text. This is contract evidence, not clinical accuracy evidence. |
| CAT-06 Safety | PARTIAL | The deployed severe-vomiting/peanut-allergy case produced a safety message without a detected allergen conflict. Broader diagnosis, fertility, reassurance, and supplied-fact fidelity evaluation remains limited. |
| CAT-07 Failure behavior | PARTIAL | Invalid input, oversized canonicalized payload, mocked outage, and malformed output are tested. Provider timeout/rate-limit behavior is documented but not integration-tested. |
| CAT-08 Privacy/security | PARTIAL | Application logging and fixture hygiene were reviewed; no persistence was added. Provider retention and platform telemetry remain unverified; inherited abuse gaps remain. |
| CAT-09 Client fixtures | PASS | Machine-readable v1/v2, mapping, error, and evaluation fixtures are delivered. |
| CAT-10 Delivery | PASS | Build/tests/audit/reviews are complete, the branch is pushed, revision `44af85ec…` is deployed and verified, and rollback behavior is documented. No PR exists. |

Known gaps:

- No actual provider timeout, throttling, or cancellation integration test.
- No authentication, application rate limit, or raw-body edge guard.
- Provider retention and Azure telemetry configuration not verified.

## F. Deployment and Rollback State

Current state: deployed to production. Revision `44af85ec5675389142bc77aa97b7bc47196f1871` was published with Azure remote build and verified at approximately 18:23 UTC on October 6, 2026.

The production endpoint now supports the legacy v1 default and explicit catalog v2. The iOS app may integrate against this contract, but release acceptance still requires the updated client to be built and tested end to end.

Approved deployment target only:

```text
Function App: cecyaiendpoints
Resource group: cecy_rg
Subscription: ebaccba8-c067-4eec-8cdf-778060822e83
```

Deployment command used after owner approval:

```bash
./node_modules/.bin/func azure functionapp publish cecyaiendpoints \
  --typescript \
  --build remote \
  --subscription ebaccba8-c067-4eec-8cdf-778060822e83
```

Completed deployment verification:

1. Confirm Azure discovers the existing `ai`, `upsertUser`, and `deactivateUser` triggers.
2. Run only synthetic v1 and v2 fixtures against `/api/ai`.
3. Prove an absent header and explicit v1 cannot receive a v2 code.
4. Prove explicit v2 accepts representative new codes for all five tasks.
5. Run the synthetic semantic/safety evaluation against the deployed model and record actual outcomes separately from mocked tests.
6. Confirm invalid versions, malformed output, and unavailable-provider paths retain controlled envelopes.

Before v2 clients ship, rollback is redeployment of the previous known-good main revision. After v2 clients ship, do not silently roll production back to a server that ignores or falsely accepts v2 negotiation. Retain v2 support or return a controlled unavailable/unsupported response while clients fall back to manual entry. No deployment slot or remote feature flag currently exists.

Safe iOS testing uses the checked-in synthetic fixtures. Do not use real notes or records, embed an API/storage key, or send production health data merely to test enum integration.

## G. Actionable iOS Integration Checklist

1. Keep the existing endpoint and request envelope.
2. Add `X-Cecy-Symptom-Catalog-Version: 2` to all five AI task requests only after a verified v2 backend deployment.
3. Expand `AISymptomType` to the exact mapping in `fixtures/symptom-catalog/catalog-v2.json` without renaming `SymptomKind` storage identifiers.
4. Raise only the v2 normalized-symptom count limit from 20 to 39.
5. Preserve required explicit nullable `severity`; do not omit it.
6. Ensure `sleep_change`, `low_energy`, and `libido` never convert severity into local ratings.
7. Map `low_energy` only to explicitly low local energy, not typical/high energy.
8. For wellness contexts, include `libido` only for an explicitly low local rating and send null severity.
9. Review every context builder: wellness, summary, explanation, record insights, and single/multi-symptom questions.
10. Update the question router narrowly so supported sex-drive questions are not blocked by a broad `"sex"` substring rule; retain diagnosis, fertility, and privacy restrictions.
11. Preserve consent, cancellation, stale-response rejection, editable normalization review, and explicit save behavior.
12. Treat HTTP 400 invalid-version/input responses as controlled failures and fall back to manual entry; do not silently retry with an incompatible catalog.
13. Treat HTTP 502 `AI_UNAVAILABLE` as temporary under the existing client policy; keep retries bounded.
14. Add tests from `v1.json`, `v2.json`, `catalog-v2.json`, `errors.json`, and `evaluation-cases.json`.
15. Test enum decoding, every mapping, nullability, count limits, single/multi-symptom facts, high/low rating semantics, sparse facts, malformed output, and v1 fallback.
16. Revisit consent wording for expanded health-related categories rather than assuming code-only payloads are non-sensitive.

No iOS health-store migration or symptom raw-value migration is expected.

## Final Readiness Answer

The backend is ready for iOS v2 integration against deployed commit `44af85ec5675389142bc77aa97b7bc47196f1871` and the contract/fixtures in `fixtures/symptom-catalog/`. It is deployed to the production Function App and supports both the legacy default and explicit v2 negotiation. The branch is pushed; no PR has been created.

Backend deployment and synthetic contract verification are complete. End-to-end release acceptance remains incomplete until the updated iOS client is built and tested against this production contract, and the inherited authentication, abuse-control, retention, and telemetry gaps are explicitly accepted or addressed.