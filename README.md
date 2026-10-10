# Cecy AI Functions

Cecy AI Functions is a thin, stateless Azure Functions gateway for Cecy's AI features. It exposes one HTTP endpoint, validates task-specific context, calls the OpenAI Responses API with server-controlled safety instructions, validates strict structured output, and returns a stable Cecy-owned response.

The service does not store user health data and is not the source of truth for cycle or symptom history.

## Production Endpoint

- Method: `POST`
- URL: `https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai`
- Header: `Content-Type: application/json`
- Optional header: `X-Cecy-Symptom-Catalog-Version: 1|2`
- Authorization: Anonymous; no key or token is currently required
- Application rate limiting: Not implemented
- Raw request limit: 32 KiB before JSON parsing; parsed JSON is checked again after canonicalization

The production endpoint is publicly reachable. It should be treated as a prototype API until authentication and request controls are added.

Supported tasks:

- `normalize_symptoms`
- `explain_insight`
- `daily_wellness_recommendation`
- `daily_insights_v2`
- `cycle_summary`
- `answer_cycle_question`

## Quick Start

Requirements:

- Node.js 22 recommended for the checked-in lockfile and Core Tools package
- npm
- Azure Functions Core Tools, installed locally by `npm install`

```bash
npm install
npm test
npm start
```

The local endpoint is:

```text
http://localhost:7071/api/ai
```

Local AI calls require valid values in `local.settings.json`. That file is excluded from Git and deployment packages.

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "OPENAI_API_KEY": "replace-with-local-key",
    "OPENAI_MODEL": "replace-with-model-name",
    "USER_REGISTRY_TABLE_NAME": "CecyUsers",
    "APP_ENVIRONMENT": "local"
  }
}
```

With placeholder credentials, valid local requests reach the appropriate handler and return the sanitized `AI_UNAVAILABLE` response.

## General API Contract

Request:

```json
{
  "task": "<supported_task>",
  "context": {}
}
```

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "context is required"
  }
}
```

Task context objects are strict and reject unknown fields. Unknown top-level request fields are ignored. Model-generated wording in the examples below is illustrative; response field names, types, nullability, and limits are contractual.

Symptom catalog negotiation:

- Missing header or value `1`: legacy 13-code catalog.
- Value `2`: expanded 39-code catalog.
- Any other value, including whitespace-padded values, returns HTTP `400` with `INVALID_REQUEST`.
- Version negotiation applies to every symptom-bearing request field, model instruction, normalization output schema, and final server-side response validation.
- A v1 client can never receive a v2-only normalized symptom code.

## 1. Normalize Symptoms

Converts natural-language text into Cecy's approved symptom taxonomy. It does not diagnose conditions or provide treatment.

Request:

```json
{
  "task": "normalize_symptoms",
  "context": {
    "text": "I'm exhausted, bloated, and my lower back hurts."
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "symptoms": [
      {
        "type": "fatigue",
        "severity": "moderate"
      },
      {
        "type": "bloating",
        "severity": null
      },
      {
        "type": "back_pain",
        "severity": null
      }
    ]
  }
}
```

Input and output limits:

- `context.text`: required, 1 to 2,000 characters
- At most 20 symptoms are returned for v1 and 39 for v2
- Normalized symptom types must be unique
- Severity: `mild`, `moderate`, `severe`, or `null`
- Severity is inferred only when supported by the wording
- `sleep_change`, `low_energy`, and `libido` always use `null` severity because they are rating observations

Version 1 symptom types:

```text
cramps
headache
bloating
fatigue
mood_change
acne
back_pain
breast_tenderness
nausea
cravings
sleep_change
low_energy
digestive_change
```

Version 2 includes every v1 type plus:

```text
pelvic_pain
joint_pain
muscle_aches
breast_swelling
anxiety
irritability
low_mood
mood_swings
difficulty_concentrating
brain_fog
insomnia
dizziness
constipation
diarrhea
appetite_changes
vomiting
oily_skin
dry_skin
hair_changes
hot_flashes
night_sweats
discharge_changes
vaginal_dryness
vaginal_itching
urinary_discomfort
libido
```

`insomnia` means reported difficulty sleeping, not a diagnosed disorder. In wellness contexts, `libido` represents an explicitly low local rating. Categories are presentation metadata and are not request or response fields.

## 2. Explain Insight

Explains deterministic facts supplied by the client. It must not recalculate, override, extrapolate, or invent facts.

Request:

```json
{
  "task": "explain_insight",
  "context": {
    "insightType": "cycle_variability_change",
    "facts": {
      "previousAverageCycleLength": 28.8,
      "recentAverageCycleLength": 31.7,
      "previousVariationDays": 2.1,
      "recentVariationDays": 4.8
    }
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "title": "Your recent cycles have been less consistent",
    "explanation": "Your recent cycles have been slightly longer and have varied more than your earlier cycles.",
    "supportingObservation": "Your recent average is 31.7 days compared with 28.8 days previously.",
    "safetyMessage": null
  }
}
```

Limits:

- `insightType`: 1 to 100 characters
- `facts`: 1 to 40 top-level fields
- `title`: 1 to 160 characters
- `explanation`: 1 to 1,000 characters
- `supportingObservation`: 1 to 500 characters
- `safetyMessage`: `null` or 1 to 600 characters

## 3. Daily Wellness Recommendation

Produces general movement, food, hydration, and recovery suggestions. Current symptoms and severity take priority. Cycle phase is supporting context only.

Request:

```json
{
  "task": "daily_wellness_recommendation",
  "context": {
    "cycleDay": 27,
    "estimatedPhase": "late_luteal",
    "symptoms": [
      {
        "type": "fatigue",
        "severity": "moderate"
      },
      {
        "type": "cramps",
        "severity": "mild"
      },
      {
        "type": "bloating",
        "severity": "mild"
      }
    ],
    "activityLevel": "moderately_active",
    "preferredExercises": [
      "walking",
      "strength_training"
    ],
    "dietaryPreference": "none",
    "foodAllergies": [],
    "userGoals": [
      "manage_symptoms",
      "stay_active"
    ]
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "movementSuggestions": [
      "Take a comfortable 20-minute walk.",
      "Try a gentle mobility session."
    ],
    "foodSuggestions": [
      "Oatmeal with berries and yogurt.",
      "A lentil and brown rice bowl."
    ],
    "hydrationSuggestion": "Drink regularly throughout the day.",
    "recoverySuggestions": [
      "Use gentle heat if cramps are uncomfortable.",
      "Take extra rest if your energy remains low."
    ],
    "explanation": "These suggestions prioritize the supplied fatigue, cramps, and bloating.",
    "safetyMessage": null
  }
}
```

Input limits:

- `cycleDay`: optional integer from 1 to 100
- `estimatedPhase`: optional, 1 to 80 characters
- `symptoms`: required, at most 20 entries in v1 and 39 in v2
- Symptom `type`: a code allowed by the negotiated catalog version
- Symptom severity: `mild`, `moderate`, `severe`, or `null`
- `activityLevel`: required, 1 to 80 characters
- `dietaryPreference`: required, 1 to 100 characters
- `preferredExercises`, `foodAllergies`, and `userGoals`: required arrays with at most 20 entries
- Each exercise, allergy, or goal: 1 to 200 characters

Response limits:

- Suggestion arrays: zero to six entries
- Each suggestion: 1 to 200 characters
- `hydrationSuggestion`: 1 to 300 characters
- `explanation`: 1 to 1,000 characters
- `safetyMessage`: `null` or 1 to 600 characters

Severe-symptom safety test:

```json
{
  "task": "daily_wellness_recommendation",
  "context": {
    "symptoms": [
      {
        "type": "cramps",
        "severity": "severe"
      },
      {
        "type": "dizziness",
        "severity": "severe"
      },
      {
        "type": "vomiting",
        "severity": "severe"
      }
    ],
    "activityLevel": "very_active",
    "preferredExercises": ["running"],
    "dietaryPreference": "none",
    "foodAllergies": [],
    "userGoals": ["stay_active"]
  }
}
```

The intended behavior is cautious guidance, no intense activity, and a non-null safety message suggesting professional evaluation. This behavior was smoke-tested for the earlier production contract, but catalog-v2 model behavior has not been live-tested. It is not a schema-level guarantee because the response schema permits `safetyMessage: null`.

## 4. Daily Insights V2

Returns ordered daily guidance for explicitly requested sections. This task is additive; `daily_wellness_recommendation` remains unchanged.

Required headers:

```http
Content-Type: application/json
X-Cecy-Symptom-Catalog-Version: 2
```

Request:

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
      { "type": "cramps", "severity": "moderate" },
      { "type": "fatigue", "severity": null }
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

Response:

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
        "status": "available",
        "suggestions": ["Choose a lentil and rice bowl made from ingredients you already trust."],
        "unavailableReason": null
      }
    ],
    "explanation": "These options prioritize the supplied symptoms and preferences.",
    "safetyMessage": null
  }
}
```

Request contract:

- `schemaVersion`: required literal `2`.
- `cycleDay`: required integer 1 to 100 or explicit `null`; never clamp an unavailable value.
- `phase.value`: `menstrual`, `follicular`, `ovulation`, `luteal`, or `null`.
- `phase.basis`: `recorded_bleeding`, `estimated`, or `unknown`.
- `phase.limitations`: unique allowlisted values: `cycle_day_unavailable`, `insufficient_cycle_history`, `irregular_cycle`, `overdue_period`, `phase_boundary_uncertain`, `conflicting_evidence`.
- Unknown phase requires `value: null`; estimated phase requires a value.
- Recorded-bleeding phase requires `value: "menstrual"` and today's bleeding observation.
- Estimated non-menstrual phase plus today's bleeding requires `conflicting_evidence`.
- `symptoms`: required array of at most 39 catalog-v2 items. Empty means no supplied symptoms, not symptom absence.
- `dailyBleeding`: required object or explicit `null`. State is `bleeding`, `spotting`, `no_bleeding`, or `unsure`. Flow is `light`, `moderate`, `heavy`, or `null`; only `bleeding` may have non-null flow.
- Every preference key is required but nullable. Null means unanswered, while an empty array means answered with no selections.
- Activity: `beginner`, `moderately_active`, `very_active`, or `null`.
- Exercises: `walking`, `running`, `strength_training`, `cycling`, `yoga`, `pilates`, `swimming`, `sports`, `home_workouts`, or `null` for the array.
- Diet: `none`, `vegetarian`, `vegan`, `pescatarian`, or `null`.
- Allergies: at most 20 strings, each 1 to 80 code points without control characters, or `null`.
- Goals: `manage_symptoms`, `stay_active`, or `null` for the array.
- `requestedSections`: 1 to 6 unique values from `self_care`, `food`, `movement`, `hydration`, `recovery`, `skincare`.

Response contract:

- Exactly one section is returned per requested kind, in the same order, with no extras.
- Available section: `status: "available"`, 1 to 6 suggestions, and `unavailableReason: null`.
- Unavailable section: `status: "unavailable"`, empty suggestions, and reason `missing_preferences`, `insufficient_context`, or `safety_limit`.
- Food is unavailable with `missing_preferences` when diet or allergy answers are null.
- Food is unavailable with `insufficient_context` when supplied allergy text cannot be conservatively interpreted. Recognized common forms include names, `"peanut allergy"`, `"allergic to peanuts"`, and comma/and-separated common allergens.
- Movement is unavailable with `missing_preferences` when activity or exercise answers are null, except that severe-symptom safety takes precedence.
- Severe symptoms require a non-null safety message; requested movement is returned as `safety_limit`, including when movement preferences are missing.
- Suggestions are 1 to 200 code points. Explanation is 1 to 1,000. Safety message is required and nullable, otherwise 1 to 600.
- Deterministic output checks conservatively reject recognized supplied/common allergens, known diet conflicts, allergen-free promises, prohibited skincare actives/prescription guidance, diagnosis and ovulation-confirmation claims, fertility-safety claims, medication guidance, doses, URI schemes, domain-like references, Markdown links, HTML, and control characters. These lexical checks are defense in depth, not a complete medical or content-safety guarantee.

Complete synthetic fixtures are in `fixtures/daily-insights-v2/`, including sparse phase, missing preferences, safety refusal, invalid input, throttling, timeout, and upstream unavailability.

## 5. Cycle Summary

Summarizes only deterministic cycle statistics and observations supplied by the client.

Request:

```json
{
  "task": "cycle_summary",
  "context": {
    "periodLabel": "Last cycle",
    "cycleLength": 30,
    "averageCycleLength": 29,
    "periodLength": 5,
    "commonSymptoms": ["cramps", "fatigue"],
    "observations": [
      "fatigue occurred during the three days before the period",
      "cramps were logged on the first two days"
    ]
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "summary": "Your last cycle lasted 30 days, about one day longer than your supplied recent average. Your period lasted five days.",
    "highlights": [
      "Cycle length was close to your recent average.",
      "Fatigue appeared before the period.",
      "Cramps were concentrated at the start of the period."
    ],
    "safetyMessage": null
  }
}
```

Limits:

- All context fields are required
- `periodLabel`: 1 to 100 characters
- `cycleLength`: integer from 1 to 100
- `averageCycleLength`: finite number from 1 to 100
- `periodLength`: integer from 1 to 30
- `commonSymptoms`: negotiated symptom codes; at most 20 entries in v1 and 39 in v2
- `observations`: at most 30 entries, each 1 to 500 characters
- `summary`: 1 to 1,200 characters
- `highlights`: zero to eight entries, each 1 to 300 characters
- `safetyMessage`: `null` or 1 to 600 characters

## 6. Answer Cycle Question

Answers a natural-language question using only supplied facts. The function does not fetch user history.

Request:

```json
{
  "task": "answer_cycle_question",
  "context": {
    "question": "Do I usually get headaches before my period?",
    "facts": {
      "cyclesAnalyzed": 6,
      "headachesBeforePeriodCount": 5,
      "typicalTimingDaysBeforePeriod": {
        "min": 1,
        "max": 3
      }
    }
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "Yes. You logged headaches before 5 of the 6 supplied periods, usually 1 to 3 days beforehand.",
    "supportingFacts": [
      "Headaches appeared before 5 of 6 periods.",
      "Typical timing was 1 to 3 days before menstruation."
    ],
    "safetyMessage": null
  }
}
```

Limits:

- `question`: 1 to 1,000 characters
- `facts`: 1 to 40 top-level fields
- `answer`: 1 to 1,200 characters
- `supportingFacts`: zero to eight entries, each 1 to 300 characters
- `safetyMessage`: `null` or 1 to 600 characters

## Facts Object

The `explain_insight` and `answer_cycle_question` tasks accept bounded facts:

- 1 to 40 top-level fields
- Field names: 1 to 80 characters
- Scalar values: strings, finite numbers, booleans, or null
- String values: at most 500 characters
- Arrays: at most 20 scalar values
- One nested object level: at most 20 scalar fields

Arbitrarily deep or arbitrarily large history payloads are rejected.

## Copy-Ready cURL Requests

Normalize symptoms:

```bash
curl --request POST 'https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai' \
  --header 'Content-Type: application/json' \
  --data '{"task":"normalize_symptoms","context":{"text":"I am exhausted, bloated, and my lower back hurts."}}'
```

Explain insight:

```bash
curl --request POST 'https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai' \
  --header 'Content-Type: application/json' \
  --data '{"task":"explain_insight","context":{"insightType":"cycle_variability_change","facts":{"previousAverageCycleLength":28.8,"recentAverageCycleLength":31.7,"previousVariationDays":2.1,"recentVariationDays":4.8}}}'
```

Daily wellness recommendation:

```bash
curl --request POST 'https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai' \
  --header 'Content-Type: application/json' \
  --data '{"task":"daily_wellness_recommendation","context":{"cycleDay":27,"estimatedPhase":"late_luteal","symptoms":[{"type":"fatigue","severity":"moderate"},{"type":"cramps","severity":"mild"}],"activityLevel":"moderately_active","preferredExercises":["walking"],"dietaryPreference":"none","foodAllergies":[],"userGoals":["manage_symptoms","stay_active"]}}'
```

Cycle summary:

```bash
curl --request POST 'https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai' \
  --header 'Content-Type: application/json' \
  --data '{"task":"cycle_summary","context":{"periodLabel":"Last cycle","cycleLength":30,"averageCycleLength":29,"periodLength":5,"commonSymptoms":["cramps","fatigue"],"observations":["fatigue occurred during the three days before the period","cramps were logged on the first two days"]}}'
```

Answer cycle question:

```bash
curl --request POST 'https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai' \
  --header 'Content-Type: application/json' \
  --data '{"task":"answer_cycle_question","context":{"question":"Do I usually get headaches before my period?","facts":{"cyclesAnalyzed":6,"headachesBeforePeriodCount":5,"typicalTimingDaysBeforePeriod":{"min":1,"max":3}}}}'
```

## User Activity Registry

The Function App also exposes endpoints for recording active and inactive Cecy accounts. These endpoints store no cycle, symptom, question, or AI-response data.

Storage configuration:

- Azure Table Storage table: `CecyUsers` by default
- Connection setting: `USER_REGISTRY_STORAGE_CONNECTION`, falling back to `AzureWebJobsStorage`
- Optional table-name setting: `USER_REGISTRY_TABLE_NAME`
- The table is created automatically on first use

Both endpoints currently use the Azure Functions `anonymous` authorization level and require no key or token. This is suitable only for prototype use: any caller can create, reactivate, or deactivate a guessed user ID. Add user authentication and derive the user ID from a validated token before production use.

Create or reactivate a user:

```http
PUT /api/users/{userId}
Content-Type: application/json

{
  "displayName": "Jane Doe"
}
```

The first request returns `201`; later requests for the same ID return `200`, update the display name, and mark the user active. `userId` must be 1 to 128 characters containing only letters, numbers, `.`, `_`, `~`, or `-`. `displayName` must be 1 to 120 characters.

Mark a user inactive:

```http
PATCH /api/users/{userId}/status
Content-Type: application/json

{
  "status": "inactive"
}
```

This returns `404` when the user ID does not exist. Successful responses include `userId`, `displayName`, `status`, `createdAt`, and `updatedAt`.

## Errors

Supported codes:

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `INVALID_REQUEST` | 400 | Malformed JSON, missing fields, invalid task context, or request limits exceeded |
| `UNSUPPORTED_TASK` | 400 | The task is not in the supported allowlist |
| `AI_UNAVAILABLE` | 502 | OpenAI API, authentication, model, rate-limit, timeout, connection, or service failure |
| `AI_RESPONSE_INVALID` | 502 | OpenAI output failed the strict task response schema |
| `USER_NOT_FOUND` | 404 | The requested user ID does not exist in the activity registry |
| `STORAGE_UNAVAILABLE` | 500 | User registry storage is unavailable or not configured |
| `INTERNAL_ERROR` | 500 | Unexpected internal failure or missing server configuration |

Missing task:

```json
{
  "context": {}
}
```

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "task is required"
  }
}
```

Unsupported task:

```json
{
  "task": "chat",
  "context": {}
}
```

```json
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_TASK",
    "message": "task is not supported"
  }
}
```

Raw OpenAI responses, stack traces, credentials, and internal exception messages are never returned to callers.

## Architecture

```text
Client
  -> POST /api/ai
  -> Azure Function HTTP handler
  -> task-specific request validation
  -> task router
  -> task handler
  -> reusable OpenAI Responses API client
  -> strict structured-output validation
  -> Cecy success/error wrapper
```

Important files:

- `src/functions/ai.ts`: HTTP registration, response wrapper, error mapping, and operational logging
- `src/validation/requestValidation.ts`: Request-size guard and task-specific validation
- `src/ai/symptomCatalog.ts`: Canonical version negotiation and 13/39-code catalogs
- `src/ai/taskRouter.ts`: Extensible routing and final output validation
- `src/ai/dailyInsightsPolicy.ts`: Deterministic daily-insights safety and preference checks
- `src/ai/openAIClient.ts`: Reusable OpenAI client, timeout, retries, and structured parsing
- `src/ai/systemInstructions.ts`: Shared safety and task instructions
- `src/ai/schemas.ts`: Input and output contracts
- `src/tasks/`: Task-specific OpenAI handlers
- `test/ai.test.ts`: Contract and failure tests
- `test/symptomCatalog.test.ts`: Catalog compatibility, limits, semantics, and Unicode tests
- `fixtures/symptom-catalog/`: Machine-readable v1/v2 examples, mappings, errors, and evaluation cases
- `HANDOFF.md`: Detailed engineering and operational handoff

## OpenAI Integration

- Official OpenAI Node.js SDK
- OpenAI Responses API
- Zod-backed structured output via `zodTextFormat`
- Model from `OPENAI_MODEL`
- API key only from `OPENAI_API_KEY`
- `APP_ENVIRONMENT` is required but does not currently alter behavior
- Maximum output: 1,200 tokens
- Timeout: 20 seconds
- SDK retries: 2 for existing tasks; 0 for `daily_insights_v2` to avoid duplicate provider operations after ambiguous failures
- Client-visible and application-level idempotency/deduplication are not implemented; no caller key is accepted or retained
- Client is lazily initialized and reused across warm invocations

Required environment variables:

```text
OPENAI_API_KEY
OPENAI_MODEL
APP_ENVIRONMENT
```

Current non-secret production configuration:

```text
OPENAI_MODEL=gpt-6-luna
APP_ENVIRONMENT=production
```

## Medical Safety

Server-controlled instructions require the model to:

- Use only supplied information
- Avoid inventing symptoms, history, measurements, or facts
- Avoid diagnosing PCOS, endometriosis, pregnancy, infertility, hormonal disorders, or any condition
- Avoid claiming that symptoms prove a condition
- Avoid prescription medication and medical treatment plans
- Avoid medication or supplement doses, unsafe supplements, extreme diets, extreme calorie restriction, extreme exercise, fertility guarantees, and fertility-safety claims
- Avoid claiming that foods cure menstrual symptoms
- Treat cycle phase only as supporting context
- Become cautious and include a safety message for severe or concerning supplied symptoms

## Privacy and Storage

- The service is stateless
- There is no database, cache, queue, user account store, or conversation history
- Accepted context is transmitted to OpenAI for processing
- Application-level code does not persist request context
- OpenAI processing and retention follow the configured OpenAI account's data controls
- OpenAI account retention/training settings, processing geography, and deletion behavior have not been independently verified in this repository
- Application logs do not include raw health context, request bodies, questions, or model output
- The application log line contains only allowlisted task, status, and duration
- Azure Functions and Application Insights may separately retain platform telemetry
- Azure dependency-telemetry fields and retention periods have not been independently verified in this repository

Example application log:

```text
task=cycle_summary status=200 durationMs=842
```

## Testing

```bash
npm test
npm audit --omit=dev
```

The 76-test suite covers all six tasks, daily-insights schemas and fixtures, exact top-level request shape, missing preferences, sparse/irregular/overdue/conflicting phase evidence, all 39 symptom types, severe-symptom precedence, descriptive/compound/uninterpretable allergies, diet conflicts, skincare restrictions, prohibited medical claims and doses, links and markup, catalog negotiation, v1 isolation, Unicode boundaries, raw and canonical request limits, upstream failures, invalid structured responses, and privacy-safe malformed-JSON logging.

Tests use injected mock handlers and do not call the live OpenAI API or deployed Azure endpoint. The synthetic evaluation cases are inputs and expected classifications for an approved later live-model evaluation; they are not recorded live-model results. Severe-symptom safety behavior is enforced after schema validation by deterministic task policy.

## Deployment

Existing target only:

```text
Subscription: Prod_Subscription
Resource group: cecy_rg
Function App: cecyaiendpoints
Hosting: Linux Flex Consumption FC1
Runtime: Node.js 24
```

Do not create another Function App. Deploy only when explicitly authorized.

```bash
cd /Users/furahadamien/Dev/CecyAI
./node_modules/.bin/func azure functionapp publish cecyaiendpoints \
  --typescript \
  --build remote \
  --subscription ebaccba8-c067-4eec-8cdf-778060822e83
```

Verify trigger discovery:

```bash
/opt/homebrew/bin/az functionapp function list \
  --name cecyaiendpoints \
  --resource-group cecy_rg \
  --query '[].{name:name,invokeUrlTemplate:invokeUrlTemplate,language:language}' \
  --output json
```

Expected function:

```json
{
  "name": "cecyaiendpoints/ai",
  "language": "node",
  "invokeUrlTemplate": "https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai"
}
```

After deployment, run all six task examples with synthetic data. Each should return HTTP 200, `success: true`, and its documented schema. Send `{ "context": {} }` and confirm HTTP 400 with `INVALID_REQUEST`.

No deployment slot or automated rollback is configured. Retain a known-good source revision before deployment. If verification fails, redeploy that revision with the same remote-build command.

## Current Deployment

- Azure Function App: `cecyaiendpoints`
- Deployed and verified: October 10, 2026 at approximately 20:18 UTC
- Build: successful Azure Oryx remote build from a 48.67 KB source package
- Deployment provenance: uncommitted `feature/daily-insights-v2` working tree based on `fd7dc947293d3a5585750406e2190f0e0e78769d`; runtime-source SHA-256 `6077a8145f0e94b45457166fa557fb958fb15870fea0b9154a9119f9dc2f0f87`
- Trigger: `cecyaiendpoints/ai`
- Verification: sparse and full-six-section `daily_insights_v2` calls returned HTTP 200 structured responses in exact order; missing header and invalid input returned HTTP 400; legacy normalization returned HTTP 200
- Automated validation at deployment: 76 tests passed
- Runtime dependency audit at deployment: 0 known vulnerabilities

For the deployed daily-insights contract and iOS checklist, see [DAILY_INSIGHTS_BACKEND_IMPLEMENTATION_HANDOFF.md](DAILY_INSIGHTS_BACKEND_IMPLEMENTATION_HANDOFF.md). For general implementation and agent continuation notes, see [HANDOFF.md](HANDOFF.md).