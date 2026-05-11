import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export type ProviderName = "anthropic" | "openai";

export interface CompleteOptions {
  system: string;
  user: string;
  // When true, instruct the provider to return strict JSON. Caller is
  // responsible for validating the parsed shape (e.g. with zod).
  json?: boolean;
}

export interface Provider {
  name: ProviderName;
  complete(opts: CompleteOptions): Promise<string>;
}

export function makeProvider(name: string): Provider {
  if (name === "anthropic") return new AnthropicProvider();
  if (name === "openai") return new OpenAIProvider();
  throw new Error(`unknown LLM provider: ${name} (expected: anthropic | openai)`);
}
