import Anthropic from "@anthropic-ai/sdk";
import type { CompleteOptions, Provider, ProviderName } from "./index.js";

export class AnthropicProvider implements Provider {
  readonly name: ProviderName = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.HEG_ANTHROPIC_MODEL ?? "claude-opus-4-7";
  }

  async complete(opts: CompleteOptions): Promise<string> {
    const system = opts.json
      ? opts.system + "\n\nRespond with ONLY a single valid JSON object. No prose, no code fences."
      : opts.system;

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: opts.user }],
    });

    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("anthropic: no text content in response");
    }
    return block.text;
  }
}
