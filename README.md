# Cecy AI Functions

Cecy AI Functions is a thin, stateless Azure Functions gateway for Cecy's AI features. It exposes one HTTP endpoint, validates task-specific context, calls the OpenAI Responses API with server-controlled safety instructions, validates strict structured output, and returns a stable Cecy-owned response.

The service does not store user health data and is not the source of truth for cycle or symptom history.

## Production Endpoint

- Method: `POST`
- URL: `https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai`
- Header: `Content-Type: application/json`
- Authorization: Anonymous; no key or token is currently required
- Application rate limiting: Not implemented
- Parsed JSON limit: 32 KiB after canonicalization with `JSON.stringify()`

The production endpoint is publicly reachable. It should be treated as a prototype API until authentication and request controls are added.

Supported tasks:

- `normalize_symptoms`
- `explain_insight`
- `daily_wellness_recommendation`
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
- At most 20 symptoms are returned
- Severity: `mild`, `moderate`, `severe`, or `null`
- Severity is inferred only when supported by the wording

Allowed symptom types:

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
- `symptoms`: required, at most 20 entries
- Symptom `type`: 1 to 80 characters
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

The intended behavior is cautious guidance, no intense activity, and a non-null safety message suggesting professional evaluation. This is server-prompted and production-smoke-tested, but not a schema-level guarantee because the response schema permits `safetyMessage: null`.

## 4. Cycle Summary

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
- `commonSymptoms`: at most 20 entries, each 1 to 200 characters
- `observations`: at most 30 entries, each 1 to 500 characters
- `summary`: 1 to 1,200 characters
- `highlights`: zero to eight entries, each 1 to 300 characters
- `safetyMessage`: `null` or 1 to 600 characters

## 5. Answer Cycle Question

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
- `src/ai/taskRouter.ts`: Extensible routing and final output validation
- `src/ai/openAIClient.ts`: Reusable OpenAI client, timeout, retries, and structured parsing
- `src/ai/systemInstructions.ts`: Shared safety and task instructions
- `src/ai/schemas.ts`: Input and output contracts
- `src/tasks/`: Task-specific OpenAI handlers
- `test/ai.test.ts`: Contract and failure tests
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
- SDK retries: 2
- Client is lazily initialized and reused across warm invocations

Required environment variables:

```text
OPENAI_API_KEY
OPENAI_MODEL
APP_ENVIRONMENT
```

Current non-secret production configuration:

```text
OPENAI_MODEL=gpt-5.5
APP_ENVIRONMENT=production
```

## Medical Safety

Server-controlled instructions require the model to:

- Use only supplied information
- Avoid inventing symptoms, history, measurements, or facts
- Avoid diagnosing PCOS, endometriosis, pregnancy, infertility, hormonal disorders, or any condition
- Avoid claiming that symptoms prove a condition
- Avoid prescription medication and medical treatment plans
- Avoid unsafe supplements, extreme diets, extreme calorie restriction, extreme exercise, and fertility guarantees
- Avoid claiming that foods cure menstrual symptoms
- Treat cycle phase only as supporting context
- Become cautious and include a safety message for severe or concerning supplied symptoms

## Privacy and Storage

- The service is stateless
- There is no database, cache, queue, user account store, or conversation history
- Accepted context is transmitted to OpenAI for processing
- Application-level code does not persist request context
- OpenAI processing and retention follow the configured OpenAI account's data controls
- Application logs do not include raw health context, request bodies, questions, or model output
- The application log line contains only allowlisted task, status, and duration
- Azure Functions and Application Insights may separately retain platform telemetry

Example application log:

```text
task=cycle_summary status=200 durationMs=842
```

## Testing

```bash
npm test
npm audit --omit=dev
```

The 14-test suite covers all five valid tasks, malformed values and JSON, unsupported tasks, missing context, invalid `normalize_symptoms` context, oversized arrays and bodies, OpenAI failures, invalid structured responses, and privacy-safe malformed-JSON logging.

Tests use injected mock handlers and do not call the live OpenAI API or deployed Azure endpoint. Severe-symptom safety behavior is prompted and production-smoke-tested, but is not deterministically enforced by the schema.

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

After deployment, run all five cURL examples with synthetic data. Each should return HTTP 200, `success: true`, and its documented schema. Send `{ "context": {} }` and confirm HTTP 400 with `INVALID_REQUEST`.

No deployment slot or automated rollback is configured. Retain a known-good source revision before deployment. If verification fails, redeploy that revision with the same remote-build command.

## Current Deployment

- Azure Function App: `cecyaiendpoints`
- Deployed and verified: October 1, 2026 at approximately 18:15 UTC
- Build: Azure Oryx remote build from a 27.46 KiB source package
- Deployment provenance: no source-control commit ID was recorded for this deployment
- Trigger: `cecyaiendpoints/ai`
- Verification: all five synthetic production task calls returned HTTP 200 structured responses; invalid input returned HTTP 400
- Automated validation at deployment: 14 tests passed
- Runtime dependency audit at deployment: 0 known vulnerabilities

For detailed implementation and agent continuation notes, see [HANDOFF.md](HANDOFF.md).