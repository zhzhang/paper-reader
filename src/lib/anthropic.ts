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

export interface ClaudeModel {
  id: string;
  displayName: string;
}

/**
 * List the models available to the given (or cached) API key, via the
 * Anthropic Models API.
 */
export async function listClaudeModels(apiKey?: string): Promise<ClaudeModel[]> {
  const key = apiKey?.trim() || getClaudeKey();
  if (!key) throw new MissingKeyError();

  const client = new Anthropic({ apiKey: key });
  const models: ClaudeModel[] = [];

  for await (const model of client.models.list({ limit: 100 })) {
    models.push({ id: model.id, displayName: model.display_name ?? model.id });
  }

  return models;
}
