# Cecy AI Azure Functions Handoff

## Purpose

This document describes the Cecy AI gateway that is implemented and deployed. It is intended for the next engineering agent working on the service.

The project is a thin, stateless Azure Functions service. Clients send a task name and structured context to one HTTP endpoint. The service validates the request, routes it to a task-specific handler, calls the OpenAI Responses API with server-controlled safety instructions, validates the structured model output, and returns a Cecy-owned response.

The service does not store user health data and must not become a source of truth for health or cycle history.

## Current Status

- Project location: `/Users/furahadamien/Dev/CecyAI`
- Azure Function App: `cecyaiendpoints`
- Azure resource group: `cecy_rg`
- Azure subscription: `Prod_Subscription`
- Subscription ID: `ebaccba8-c067-4eec-8cdf-778060822e83`
- Hosting: Linux Flex Consumption, FC1
- Runtime: Node.js
- Azure Functions programming model: v4
- Configured Azure runtime: Node.js 24
- Production status: deployed and verified on October 1, 2026 at approximately 18:15 UTC
- Deployment artifact: 27.46 KiB source package built remotely by Azure Oryx; no source-control commit ID was recorded for this deployment
- Production verification: Azure discovered `cecyaiendpoints/ai`; all five task smoke tests returned HTTP 200 with valid structured responses; invalid input returned the expected HTTP 400 contract
- Automated tests: 14 passing
- Runtime dependency audit: 0 known vulnerabilities at the last deployment

Do not create another Function App for this service. Future deployments must target the existing `cecyaiendpoints` app.

## Production API

There is one API endpoint. The `task` property selects one of five capabilities.

- Method: `POST`
- URL: `https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai`
- Authorization: Anonymous; no function key or bearer token is required
- Clients should send: `Content-Type: application/json`
- Application quotas and rate limiting: Not implemented
- Parsed JSON limit: 32 KiB after `JSON.stringify()` canonicalization; this is not a raw HTTP-body byte limit

The endpoint is publicly reachable. Treat the URL as an unauthenticated prototype API until future hardening is implemented.

General request:

```json
{
  "task": "<supported_task>",
  "context": {}
}
```

General success response:

```json
{
  "success": true,
  "data": {}
}
```

General error response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "context is required"
  }
}
```

Supported task names:

1. `normalize_symptoms`
2. `explain_insight`
3. `daily_wellness_recommendation`
4. `cycle_summary`
5. `answer_cycle_question`

Task context objects are strict and reject unknown fields. Unknown fields at the top request level are currently ignored after the supported `task` and `context` values are selected.

All model-generated response examples below are illustrative. Their field names, types, nullability, and size limits are contractual, but exact wording is not.

## API 1: Normalize Symptoms

### Purpose

Converts natural-language symptom text into Cecy's approved symptom taxonomy. It does not diagnose conditions or provide treatment.

### Request

```json
{
  "task": "normalize_symptoms",
  "context": {
    "text": "I'm exhausted, bloated, and my lower back hurts."
  }
}
```

`context.text` must be a non-empty string with at most 2,000 characters.

### Response

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

Allowed symptom types:

- `cramps`
- `headache`
- `bloating`
- `fatigue`
- `mood_change`
- `acne`
- `back_pain`
- `breast_tenderness`
- `nausea`
- `cravings`
- `sleep_change`
- `low_energy`
- `digestive_change`

Allowed severity values are `mild`, `moderate`, `severe`, or `null`. Severity is inferred only when the wording supports it. The response contains at most 20 symptoms.

## API 2: Explain Insight

### Purpose

Turns deterministic facts already computed by the client into a concise user-facing explanation. The model must not recalculate, override, or invent facts.

### Request

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

`insightType` is required and may contain at most 100 characters. `facts` must contain at least one supplied fact.

### Response

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

The wording is model-generated, but these four response fields and their types are fixed by the schema.

Response limits:

- `title`: 1 to 160 characters
- `explanation`: 1 to 1,000 characters
- `supportingObservation`: 1 to 500 characters
- `safetyMessage`: `null` or 1 to 600 characters

## API 3: Daily Wellness Recommendation

### Purpose

Produces general movement, food, hydration, and recovery suggestions from structured context. Current symptoms and severity take priority. Cycle phase is supporting context only.

### Request

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

`cycleDay` and `estimatedPhase` are optional. The other fields shown above are required, although their arrays may be empty.

Input limits:

- `cycleDay`: integer from 1 to 100
- `estimatedPhase`: 1 to 80 characters
- `symptoms`: at most 20 entries
- Symptom `type`: 1 to 80 characters
- Symptom `severity`: `mild`, `moderate`, `severe`, or `null`
- `activityLevel`: 1 to 80 characters
- `dietaryPreference`: 1 to 100 characters
- `preferredExercises`, `foodAllergies`, and `userGoals`: at most 20 entries each
- Each exercise, allergy, or goal: 1 to 200 characters

### Response

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

Response limits:

- Each suggestion list may be empty and contains at most six entries
- Each suggestion: 1 to 200 characters
- `hydrationSuggestion`: 1 to 300 characters
- `explanation`: 1 to 1,000 characters
- `safetyMessage`: `null` or 1 to 600 characters

### Severe-Symptom Safety Request

Use this request to verify safety behavior:

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
    "preferredExercises": [
      "running"
    ],
    "dietaryPreference": "none",
    "foodAllergies": [],
    "userGoals": [
      "stay_active"
    ]
  }
}
```

The intended model behavior is HTTP 200 with cautious wellness guidance, no intense activity, and a non-null `safetyMessage` suggesting prompt professional medical evaluation. The server prompt requests this behavior, and it was confirmed in the October 1 production smoke test. It is not a schema-level invariant because the schema permits `safetyMessage: null`; add deterministic enforcement if this must become guaranteed behavior.

## API 4: Cycle Summary

### Purpose

Summarizes deterministic cycle statistics and observations supplied by the client. The service does not retrieve history or infer causes.

### Request

```json
{
  "task": "cycle_summary",
  "context": {
    "periodLabel": "Last cycle",
    "cycleLength": 30,
    "averageCycleLength": 29,
    "periodLength": 5,
    "commonSymptoms": [
      "cramps",
      "fatigue"
    ],
    "observations": [
      "fatigue occurred during the three days before the period",
      "cramps were logged on the first two days"
    ]
  }
}
```

All context fields are required.

Input limits:

- `periodLabel`: 1 to 100 characters
- `cycleLength`: integer from 1 to 100
- `averageCycleLength`: finite number from 1 to 100
- `periodLength`: integer from 1 to 30
- `commonSymptoms`: at most 20 entries, each 1 to 200 characters
- `observations`: at most 30 entries, each 1 to 500 characters

### Response

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

Response limits:

- `summary`: 1 to 1,200 characters
- `highlights`: may be empty and contains at most eight entries
- Each highlight: 1 to 300 characters
- `safetyMessage`: `null` or 1 to 600 characters

## API 5: Answer Cycle Question

### Purpose

Answers a natural-language question using only facts supplied by the client. The Azure Function does not fetch user history and the model must not invent missing history.

### Request

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

`question` is required and may contain at most 1,000 characters. `facts` must contain at least one supplied fact.

### Response

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

Response limits:

- `answer`: 1 to 1,200 characters
- `supportingFacts`: may be empty and contains at most eight entries
- Each supporting fact: 1 to 300 characters
- `safetyMessage`: `null` or 1 to 600 characters

## Copy-Ready Production Requests

These commands include the production URL, method, content type, and complete request body.

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

## Facts Object Limits

The `explain_insight` and `answer_cycle_question` tasks accept a bounded `facts` object:

- 1 to 40 top-level fields
- Field names contain 1 to 80 characters
- Scalar values may be strings, finite numbers, booleans, or null
- String fact values contain at most 500 characters
- Arrays contain at most 20 scalar values
- One nested object level is supported with at most 20 scalar fields
- Arbitrarily deep or arbitrarily large history payloads are rejected

## Error Behavior

Supported error codes:

- `INVALID_REQUEST`
- `UNSUPPORTED_TASK`
- `AI_UNAVAILABLE`
- `AI_RESPONSE_INVALID`
- `INTERNAL_ERROR`

HTTP status behavior:

- `200`: Successful structured task response
- `400`: Invalid request, malformed JSON, unsupported task, missing field, or bounded-validation failure
- `500`: Unexpected internal failure or missing server configuration
- `502`: OpenAI API errors, authentication or model rejection, rate limiting, timeout/connection failure, other upstream failure, or invalid structured model response

Missing task example:

```json
{
  "context": {}
}
```

Response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "task is required"
  }
}
```

Unsupported task example:

```json
{
  "task": "chat",
  "context": {}
}
```

Response:

```json
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_TASK",
    "message": "task is not supported"
  }
}
```

No raw OpenAI response, stack trace, API key, SDK error, or internal exception message is returned to the caller.

## Architecture and Important Files

Request flow:

```text
Client
  -> POST /api/ai
  -> Azure Function HTTP handler
  -> request validation
  -> task router
  -> task-specific handler
  -> reusable OpenAI Responses API client
  -> structured-output validation
  -> Cecy success/error wrapper
```

Important files:

- `src/functions/ai.ts`: HTTP registration, response wrapper, error mapping, and privacy-safe operational logging
- `src/validation/requestValidation.ts`: Supported task allowlist, 32 KiB request guard, and task-specific request validation
- `src/ai/taskRouter.ts`: Extensible task routing and final output-schema validation
- `src/ai/openAIClient.ts`: Reusable lazy OpenAI client, timeout/retries, Responses API call, and structured parsing
- `src/ai/systemInstructions.ts`: Shared medical safety rules and task-specific instructions
- `src/ai/schemas.ts`: Input limits and structured output schemas
- `src/tasks/normalizeSymptoms.ts`: Symptom normalization handler
- `src/tasks/explainInsight.ts`: Insight explanation handler
- `src/tasks/wellnessRecommendation.ts`: Wellness recommendation handler
- `src/tasks/cycleSummary.ts`: Cycle summary handler
- `src/tasks/answerCycleQuestion.ts`: Cycle question handler
- `test/ai.test.ts`: Contract, validation, routing, malformed JSON, upstream failure, and invalid-response tests

## OpenAI Integration

- SDK: Official OpenAI Node.js SDK
- API: OpenAI Responses API
- Output mode: Zod-backed strict structured output via `zodTextFormat`
- Model: Read from `OPENAI_MODEL`
- API key: Read only from `OPENAI_API_KEY`
- Environment: `APP_ENVIRONMENT` must be present, but its value does not currently alter runtime behavior
- Output limit: 1,200 tokens
- Request timeout: 20 seconds
- SDK retries: 2
- Client lifecycle: Lazily created once and reused across warm function invocations

Required Azure application setting names:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `APP_ENVIRONMENT`

The production app currently has all three settings. Never print, log, return, or commit the API key. `local.settings.json` is ignored by source control and deployment packaging.

Current non-secret production values:

- `OPENAI_MODEL=gpt-5.5`
- `APP_ENVIRONMENT=production`

## Medical and Wellness Safety

The server owns the safety instructions. Clients must not be responsible for supplying system prompts.

The model is instructed to:

- Use only supplied information
- Never invent symptoms, history, measurements, or facts
- Avoid diagnosing PCOS, endometriosis, pregnancy, infertility, hormonal disorders, or any other condition
- Avoid implying that symptoms prove a condition
- Avoid prescription medication and medical treatment plans
- Avoid unsafe supplements, extreme diets, extreme calorie restriction, extreme exercise, and fertility guarantees
- Avoid claiming that foods cure menstrual symptoms
- Avoid claiming that cycle phase alone determines exercise choices
- Become cautious and include a safety message for severe or concerning supplied symptoms

## Privacy and Storage

The service is stateless. It has no database, cache, queue, user account system, or persistent conversation store.

Accepted context is transmitted to OpenAI to perform the requested task. The application does not persist it, but OpenAI processing and retention are governed by the configured OpenAI account and its data controls. Confirm those account-level policies before handling production health data.

Never log:

- Raw request bodies
- Symptom descriptions
- Health or cycle context
- User questions
- OpenAI responses containing health information

The application-emitted log line contains only an allowlisted task name, HTTP status, and duration, for example:

```text
task=cycle_summary status=200 durationMs=842
```

Azure Functions and Application Insights may separately retain platform request, dependency, failure, and runtime telemetry. Review Azure telemetry configuration and retention independently; do not assume the custom application log restriction disables platform telemetry.

## Local Development

From `/Users/furahadamien/Dev/CecyAI`:

Use Node.js 22 for the checked-in lockfile and local Core Tools package. The application declares Node.js 20 or newer, while the current Core Tools dependency requires Node.js 22 or newer.

```bash
npm install
npm test
npm start
```

The local endpoint is:

```text
http://localhost:7071/api/ai
```

Local AI calls require real local values in `local.settings.json`. Do not commit that file. With placeholders, valid requests pass routing and return the sanitized `AI_UNAVAILABLE` response.

`npm test` uses injected mock task handlers. It validates request and response contracts without making live OpenAI calls.

The blank local `AzureWebJobsStorage` value may produce a storage health warning. The HTTP trigger itself does not require storage for these tests.

## Testing State

The automated suite currently verifies:

- Valid `normalize_symptoms`
- Valid `explain_insight`
- Valid `daily_wellness_recommendation`
- Valid `cycle_summary`
- Valid `answer_cycle_question`
- Malformed request values
- Malformed JSON at the HTTP boundary
- Unsupported tasks
- Missing context
- Task-specific invalid context
- Oversized arrays
- Requests over 32 KiB
- OpenAI service failure mapping
- Invalid structured OpenAI response mapping
- Privacy-safe malformed-JSON logging

Coverage limitations:

- Automated tests do not call the live OpenAI API
- Automated tests do not call the deployed Azure endpoint
- Severe-symptom safety messaging is prompted and production-smoke-tested, but not deterministically enforced or asserted in the automated suite

Run this before every deployment:

```bash
npm test
npm audit --omit=dev
```

## Deployment Procedure

Deploy only when explicitly authorized. Do not create a new Function App.

Azure CLI target:

```text
Subscription: Prod_Subscription
Resource group: cecy_rg
Function App: cecyaiendpoints
```

Flex Consumption deployment must use remote build so Azure installs production dependencies and compiles TypeScript:

```bash
cd /Users/furahadamien/Dev/CecyAI
./node_modules/.bin/func azure functionapp publish cecyaiendpoints \
  --typescript \
  --build remote \
  --subscription ebaccba8-c067-4eec-8cdf-778060822e83
```

After deployment, verify that Azure discovers the `ai` HTTP trigger and test the public endpoint with synthetic, non-sensitive data for all five tasks.

Trigger discovery:

```bash
/opt/homebrew/bin/az functionapp function list \
  --name cecyaiendpoints \
  --resource-group cecy_rg \
  --query '[].{name:name,invokeUrlTemplate:invokeUrlTemplate,language:language}' \
  --output json
```

Expected trigger result includes:

```json
{
  "name": "cecyaiendpoints/ai",
  "language": "node",
  "invokeUrlTemplate": "https://cecyaiendpoints-gqdahecce6g7dufv.westus3-01.azurewebsites.net/api/ai"
}
```

Run the five commands in `Copy-Ready Production Requests`. Each should return HTTP 200, `success: true`, and the documented task schema. Also send `{ "context": {} }` and confirm HTTP 400 with `INVALID_REQUEST`.

There is no automated rollback command or deployment slot configured. Before a future deployment, retain the previous source revision or deployment package. If verification fails, redeploy that known-good revision with the same remote-build command and repeat trigger and endpoint checks. Do not create a second Function App as a rollback workaround.

## Constraints for Future Work

Do not add these without a separately approved architecture change:

- New Azure Function App resources
- Databases or persistent health-data storage
- Cosmos DB, PostgreSQL, SQL, Redis, or Service Bus
- User accounts or custom authentication databases
- Persistent conversations
- Autonomous agents
- Unrelated endpoints
- Modifications to unrelated projects under `/Users/furahadamien/Dev`

Prototype authorization remains Anonymous. Future hardening may add App Attest, DeviceCheck, installation identifiers, quotas, or rate limiting, but those are not implemented today.