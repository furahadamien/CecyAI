import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { COMMON_SAFETY_INSTRUCTIONS } from "./systemInstructions";

export class AIUnavailableError extends Error {}
export class AIResponseInvalidError extends Error {}

interface AIConfiguration {
  apiKey: string;
  model: string;
}

interface StructuredOutputRequest<T> {
  context: unknown;
  instructions: string;
  schema: z.ZodType<T>;
  schemaName: string;
}

let openAIClient: OpenAI | undefined;
let configuredApiKey: string | undefined;

function getAIConfiguration(): AIConfiguration {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  const appEnvironment = process.env.APP_ENVIRONMENT;

  if (!apiKey || !model || !appEnvironment) {
    throw new Error("AI service configuration is incomplete");
  }

  return { apiKey, model };
}

function getOpenAIClient(apiKey: string): OpenAI {
  if (!openAIClient || configuredApiKey !== apiKey) {
    openAIClient = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 2 });
    configuredApiKey = apiKey;
  }
  return openAIClient;
}

function isOpenAIServiceError(error: unknown): boolean {
  return (
    error instanceof OpenAI.APIError ||
    (error instanceof Error &&
      ["APIConnectionError", "APIConnectionTimeoutError"].includes(error.name))
  );
}

export async function requestStructuredOutput<T>({
  context,
  instructions,
  schema,
  schemaName,
}: StructuredOutputRequest<T>): Promise<T> {
  const { apiKey, model } = getAIConfiguration();
  const client = getOpenAIClient(apiKey);

  let parsed: unknown;
  try {
    const response = await client.responses.parse({
      model,
      instructions: `${COMMON_SAFETY_INSTRUCTIONS}\n\n${instructions}`,
      input: JSON.stringify(context),
      max_output_tokens: 1_200,
      text: {
        format: zodTextFormat(schema, schemaName),
      },
    });
    parsed = response.output_parsed;
  } catch (error) {
    if (isOpenAIServiceError(error)) {
      throw new AIUnavailableError("OpenAI request failed");
    }
    throw new AIResponseInvalidError("OpenAI returned an invalid response");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AIResponseInvalidError("OpenAI returned an invalid response");
  }

  return result.data;
}