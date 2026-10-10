# Daily Insights V2 Backend Implementation Handoff

Date: October 10, 2026
Status: deployed and synthetically verified in the existing prototype Function App; not yet integrated by iOS

## Deployment

- URL: `https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai`
- Method: `POST`
- Task: `daily_insights_v2`
- Required header: `X-Cecy-Symptom-Catalog-Version: 2`
- Body schema version: `2`
- Function App: `cecyaiendpoints`, resource group `cecy_rg`
- Environment: `production`
- Model: `gpt-6-luna`
- Deployment completed: October 10, 2026 at 20:18 UTC
- Remote Oryx source package: 48.67 KB
- Source branch: `feature/daily-insights-v2`
- Base commit: `fd7dc947293d3a5585750406e2190f0e0e78769d`
- Deployment used an uncommitted feature working tree. Runtime-source SHA-256 over 23 source/config files: `6077a8145f0e94b45457166fa557fb958fb15870fea0b9154a9119f9dc2f0f87`.

The existing five AI tasks remain available. No new Function App, database, cache, queue, account linkage, scheduled job, or health-data persistence was added.

## Request Contract

All fields shown below are required. Nullable fields must be sent as JSON `null`; omission is invalid. Unknown keys are invalid.

```json
{
  "task": "daily_insights_v2",
  "context": {
    "schemaVersion": 2,
    "cycleDay": 2,
    "phase": {
      "value": "menstrual",
      "basis": "recorded_bleeding",
      "limitations": []
    },
    "symptoms": [
      { "type": "cramps", "severity": "moderate" }
    ],
    "dailyBleeding": { "state": "bleeding", "flow": "moderate" },
    "preferences": {
      "activityLevel": "moderately_active",
      "preferredExercises": ["walking", "yoga"],
      "dietaryPreference": "vegetarian",
      "foodAllergies": ["Peanuts"],
      "userGoals": ["manage_symptoms", "stay_active"]
    },
    "requestedSections": [
      "self_care",
      "food",
      "movement",
      "hydration",
      "recovery",
      "skincare"
    ]
  }
}
```

Field rules:

- `schemaVersion`: literal `2`.
- `cycleDay`: integer `1...100` or `null`.
- `phase.value`: `menstrual`, `follicular`, `ovulation`, `luteal`, or `null`.
- `phase.basis`: `recorded_bleeding`, `estimated`, or `unknown`.
- `phase.limitations`: unique array of `cycle_day_unavailable`, `insufficient_cycle_history`, `irregular_cycle`, `overdue_period`, `phase_boundary_uncertain`, `conflicting_evidence`; maximum 6.
- Unknown phase requires `value: null`. Estimated phase requires a non-null value.
- Recorded-bleeding phase requires `value: "menstrual"` and today's `dailyBleeding.state: "bleeding"`.
- Estimated non-menstrual phase plus today's bleeding requires `conflicting_evidence`.
- `symptoms`: required array, maximum 39, using catalog-v2 codes. Severity is `mild`, `moderate`, `severe`, or `null`. `sleep_change`, `low_energy`, and `libido` require null severity. Empty means no supplied symptoms, not confirmed symptom absence.
- `dailyBleeding`: object or `null`. State is `bleeding`, `spotting`, `no_bleeding`, or `unsure`. Flow is `light`, `moderate`, `heavy`, or `null`; non-bleeding states require null flow.
- `activityLevel`: `beginner`, `moderately_active`, `very_active`, or `null`.
- `preferredExercises`: array of `walking`, `running`, `strength_training`, `cycling`, `yoga`, `pilates`, `swimming`, `sports`, `home_workouts`, or `null`; maximum 9.
- `dietaryPreference`: `none`, `vegetarian`, `vegan`, `pescatarian`, or `null`.
- `foodAllergies`: array of at most 20 strings, each 1...80 characters without control characters, or `null`. Common descriptive/compound forms are interpreted conservatively. Unrecognized text makes food unavailable rather than being treated as model instructions.
- `userGoals`: array of `manage_symptoms`, `stay_active`, or `null`; maximum 2.
- `requestedSections`: 1...6 unique values from `self_care`, `food`, `movement`, `hydration`, `recovery`, `skincare`. Request order controls response order.

Do not send names, dates of birth, identifiers, credentials, private notes, sexual-activity data, raw history, HealthKit metadata, period IDs, observation IDs, or absolute period dates.

## Success Contract

HTTP 200:

```json
{
  "success": true,
  "data": {
    "schemaVersion": 2,
    "sections": [
      {
        "kind": "self_care",
        "status": "available",
        "suggestions": ["Use a warm compress if it feels comfortable."],
        "unavailableReason": null
      },
      {
        "kind": "food",
        "status": "unavailable",
        "suggestions": [],
        "unavailableReason": "missing_preferences"
      }
    ],
    "explanation": "The guidance uses only the supplied context and treats estimates as estimates.",
    "safetyMessage": null
  }
}
```

Response rules:

- Exactly one section per requested kind, in request order, with no extras or duplicates.
- Available: `status: "available"`, 1...6 suggestions, `unavailableReason: null`.
- Unavailable: `status: "unavailable"`, empty suggestions, reason `missing_preferences`, `insufficient_context`, or `safety_limit`.
- Suggestion: nonempty plain text, maximum 200 characters.
- `explanation`: nonempty plain text, maximum 1,000 characters.
- `safetyMessage`: required; `null` or nonempty plain text up to 600 characters.
- Null food preferences produce a successful food section with `missing_preferences`.
- Uninterpretable allergy descriptions produce a successful food section with `insufficient_context`.
- Null movement preferences produce a successful movement section with `missing_preferences`.
- Any severe supplied symptom requires a non-null safety message. Requested movement becomes `safety_limit`, which takes precedence over missing movement preferences.
- Output policy rejects recognized allergens, known diet conflicts, allergen-free promises, prohibited skincare treatments, diagnosis and ovulation-confirmation claims, fertility-safety claims, medication guidance, doses, common URI/domain forms, Markdown links, HTML, and control characters. iOS must still render all strings as inert, non-linkified text.

## Errors And Retry

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "daily_insights_v2 requires X-Cecy-Symptom-Catalog-Version 2"
  }
}
```

- HTTP 400 `INVALID_REQUEST`: malformed JSON, missing/wrong catalog header, schema failure, or request limit. Do not retry unchanged input.
- HTTP 400 `UNSUPPORTED_TASK`: unknown task. Do not retry unchanged input.
- HTTP 502 `AI_UNAVAILABLE`: provider authentication, rate limit, timeout, connection, or service failure. Retry only after explicit user action; no client automatic loop.
- HTTP 502 `AI_RESPONSE_INVALID`: model output failed schema or deterministic policy. Explicit manual retry may be offered; do not loop automatically.
- HTTP 500 `INTERNAL_ERROR`: unexpected backend/configuration failure. Do not automatically loop.
- Missing preferences are not errors and are not retryable failures; they are HTTP 200 unavailable sections.
- Errors never include provider prompts, raw health context, model output, or stack traces.

`daily_insights_v2` has a 20-second provider timeout and zero SDK retries. Existing tasks retain two SDK retries. No caller idempotency key is accepted, generated, stored, or deduplicated. iOS owns daily request deduplication and manual retry.

## Limits

- Backend request limit: 32 KiB of raw UTF-8 request data before JSON parsing. Parsed JSON is checked again after canonicalization. iOS should retain its 32 KiB request limit.
- Model output limit: 1,200 tokens.
- Response fields are bounded by schema and remain below the iOS 128 KiB response limit.
- iOS should retain its 75-second request timeout, no-redirect policy, ephemeral session, no cookies, and no HTTP cache.

## Privacy And Operations

- Application code is stateless and logs only allowlisted task, HTTP status, and duration.
- Request/response bodies, questions, symptoms, bleeding, preferences, and generated content are not application-logged or persisted.
- Accepted context is sent to the configured OpenAI provider. No new external destination was added.
- OpenAI account retention/training settings, processing geography, and deletion behavior remain unverified in this repository.
- Azure Functions/Application Insights dependency fields and retention periods remain unverified in this repository.
- The endpoint remains anonymous and has no application rate limiting. This is an inherited high-risk prototype constraint. Do not enable unrestricted live health-data use until authentication, quotas/rate limits, budget controls, and provider/Azure retention settings are approved.

## Fixtures And Evidence

Synthetic fixtures:

- `fixtures/daily-insights-v2/success.json`
- `fixtures/daily-insights-v2/sparse-unknown.json`
- `fixtures/daily-insights-v2/missing-preferences.json`
- `fixtures/daily-insights-v2/safety-refusal.json`
- `fixtures/daily-insights-v2/errors.json`

Automated release evidence:

- TypeScript build: passed.
- Tests: 76 passed, 0 failed.
- Production dependency audit: 0 vulnerabilities.
- Patch whitespace check: passed.
- Code review: approved with no blockers.
- Security review: no introduced blocker; inherited anonymous access and retention verification remain launch gates.
- Deployment package inspection excluded Markdown, Git data, local settings, dependencies, tests, fixtures, and Copilot session metadata.

Live synthetic verification on October 10, 2026:

- Sparse unknown-phase request: HTTP 200, schema v2, exact `self_care`, `hydration`, `skincare` order.
- Full six-section request: HTTP 200, schema v2, exact requested order and valid section discriminants.
- Missing catalog-v2 header: HTTP 400 sanitized `INVALID_REQUEST`.
- Invalid request fixture: HTTP 400 sanitized `INVALID_REQUEST`.
- Legacy `normalize_symptoms`: HTTP 200 with unchanged response shape.

The live checks are contract smokes, not a clinical-quality or exhaustive live-model evaluation.

## iOS Integration Checklist

1. Add a catalog-v2 request builder with every required nullable field encoded explicitly.
2. Preserve phase uncertainty and conflicting evidence; never derive confirmed hormones or ovulation.
3. Add the new automatic-consent disclosure before transmitting phase/bleeding fields.
4. Validate exact section order, discriminated availability status, bounds, and required nullable safety message.
5. Render all generated strings as inert, non-linkified plain text.
6. Treat unavailable sections as successful results, not transport failures.
7. Keep Today and Insights behind one memory-only per-day coordinator; iOS owns invalidation and deduplication.
8. Permit only explicit manual retry for 502 responses; do not add an automatic retry loop.
9. Do not send live health payloads until authentication/rate limiting and retention/data-control review are approved.
10. Add integration tests from the supplied synthetic fixtures before enabling the feature.
