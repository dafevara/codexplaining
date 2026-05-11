import OpenAI from "openai";
import type { CompleteOptions, Provider, ProviderName } from "./index.js";

export class OpenAIProvider implements Provider {
  readonly name: ProviderName = "openai";
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.HEG_OPENAI_MODEL ?? "gpt-4o";
  }

  async complete(opts: CompleteOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("openai: empty response");
    return text;
  }
}
