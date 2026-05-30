import Anthropic from "@anthropic-ai/sdk";
import { getClaudeKey, getClaudeModel } from "@/lib/settings";

export class MissingKeyError extends Error {
  constructor() {
    super("No Claude API key configured.");
    this.name = "MissingKeyError";
  }
}

/**
 * Send a single-turn prompt to Claude and return the concatenated text.
 */
export async function askClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const key = getClaudeKey();
  if (!key) throw new MissingKeyError();

  const model = getClaudeModel();
  const client = new Anthropic({ apiKey: key });

  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 512,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
