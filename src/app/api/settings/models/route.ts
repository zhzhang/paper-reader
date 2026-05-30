import { NextResponse } from "next/server";
import { listClaudeModels, MissingKeyError } from "@/lib/anthropic";

export const runtime = "nodejs";

// Lists models available to the cached key, or to an apiKey passed in the body
// (so the user can preview models before saving a new key).
export async function POST(req: Request) {
  let apiKey: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    apiKey = typeof body?.apiKey === "string" ? body.apiKey : undefined;
  } catch {
    apiKey = undefined;
  }

  try {
    const models = await listClaudeModels(apiKey);
    return NextResponse.json({ models });
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return NextResponse.json(
        { error: "No Claude API key available.", needsKey: true },
        { status: 428 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to list models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
