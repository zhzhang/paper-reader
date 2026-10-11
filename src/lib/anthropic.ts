import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

export function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function pdfDocumentBlock(filePath: string, options?: { cache?: boolean }) {
  const data = readFileSync(filePath);
  const base64 = data.toString("base64");
  const block: Anthropic.DocumentBlockParam = {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: base64,
    },
    citations: { enabled: true },
  };
  if (options?.cache) {
    (block as Anthropic.DocumentBlockParam & { cache_control?: { type: "ephemeral" } }).cache_control =
      { type: "ephemeral" };
  }
  return block;
}
