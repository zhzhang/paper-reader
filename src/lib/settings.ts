import { getSettingRow, setSettingRow } from "@/lib/db";

export const CLAUDE_KEY_SETTING = "claude_api_key";
export const CLAUDE_MODEL_SETTING = "claude_model";

export const DEFAULT_CLAUDE_MODEL =
  process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";

export function getSetting(key: string): string | null {
  return getSettingRow(key);
}

export function setSetting(key: string, value: string): void {
  setSettingRow(key, value);
}

export function getClaudeKey(): string | null {
  return getSetting(CLAUDE_KEY_SETTING) || process.env.ANTHROPIC_API_KEY || null;
}

export function getClaudeModel(): string {
  return getSetting(CLAUDE_MODEL_SETTING) || DEFAULT_CLAUDE_MODEL;
}
