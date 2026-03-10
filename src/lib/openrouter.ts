import OpenAI from "openai";

const globalForOpenRouter = globalThis as unknown as {
  openrouter: OpenAI | undefined;
};

export function getOpenRouter(): OpenAI {
  if (globalForOpenRouter.openrouter) return globalForOpenRouter.openrouter;

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "missing",
    defaultHeaders: {
      "HTTP-Referer": "https://potolok.ai",
      "X-Title": "PotolokAI",
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForOpenRouter.openrouter = client;
  }

  return client;
}

export const AI_MODEL = "anthropic/claude-sonnet-4";
export const VISION_MODEL = "anthropic/claude-sonnet-4";
