import { NextResponse } from "next/server";
import {
  CLAUDE_KEY_SETTING,
  CLAUDE_MODEL_SETTING,
  getClaudeModel,
  getSetting,
  setSetting,
} from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const key = getSetting(CLAUDE_KEY_SETTING);
  const model = getClaudeModel();
  return NextResponse.json({
    configured: Boolean(key) || Boolean(process.env.ANTHROPIC_API_KEY),
    model,
  });
}

export async function POST(req: Request) {
  let body: { apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.apiKey !== undefined) {
    const trimmed = body.apiKey.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "API key is empty." }, { status: 400 });
    }
    setSetting(CLAUDE_KEY_SETTING, trimmed);
  }

  if (body.model !== undefined && body.model.trim()) {
    setSetting(CLAUDE_MODEL_SETTING, body.model.trim());
  }

  return NextResponse.json({ configured: true, model: getClaudeModel() });
}
