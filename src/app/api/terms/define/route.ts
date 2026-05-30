import { NextResponse } from "next/server";
import {
  createTermDefinition,
  getPaperById,
  getTermDefinition,
} from "@/lib/db";
import { askClaude, MissingKeyError } from "@/lib/anthropic";

export const runtime = "nodejs";

interface Body {
  paperId: string;
  formulaTex: string;
  termTex: string;
  contextText?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { paperId, formulaTex, termTex, contextText } = body;
  if (!paperId || !formulaTex || !termTex) {
    return NextResponse.json(
      { error: "paperId, formulaTex and termTex are required." },
      { status: 400 },
    );
  }

  // Serve from cache when available.
  const cached = getTermDefinition(paperId, formulaTex, termTex);
  if (cached) {
    return NextResponse.json({
      definition: cached.definition,
      source: cached.source,
      cached: true,
    });
  }

  const paper = getPaperById(paperId);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const system =
    "You are a careful research assistant helping a reader understand mathematical notation in an academic paper. " +
    "Given a specific term/symbol selected from a formula, explain concisely what it represents. " +
    "Strongly prefer the definition the paper itself gives (use the provided context). " +
    "If the paper context defines it, base your answer on that and set fromPaper=true. " +
    "Otherwise use your general knowledge of the field and set fromPaper=false. " +
    "Keep the explanation to 1-3 sentences, plain and precise. " +
    "Wrap any mathematical symbols or expressions in LaTeX math delimiters: $...$ for inline math. " +
    'Respond ONLY with strict JSON: {"definition": string, "fromPaper": boolean}.';

  const user = [
    `Paper title: ${paper.title}`,
    paper.abstract ? `Abstract: ${paper.abstract}` : "",
    contextText ? `Surrounding text: ${contextText}` : "",
    `Full formula (LaTeX): ${formulaTex}`,
    `Selected term (LaTeX): ${termTex}`,
    "",
    "Define the selected term as used in this formula.",
  ]
    .filter(Boolean)
    .join("\n");

  let definition = "";
  let source = "llm";
  try {
    const raw = await askClaude({ system, user, maxTokens: 400 });
    const parsed = extractJson(raw);
    definition = parsed?.definition?.trim() || raw.trim();
    source = parsed?.fromPaper ? "paper" : "llm";
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return NextResponse.json(
        { error: "No Claude API key configured.", needsKey: true },
        { status: 428 },
      );
    }
    const message = err instanceof Error ? err.message : "LLM request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!definition) {
    return NextResponse.json(
      { error: "Could not generate a definition." },
      { status: 502 },
    );
  }

  createTermDefinition({ paperId, formulaTex, termTex, definition, source });

  return NextResponse.json({ definition, source, cached: false });
}

function extractJson(
  s: string,
): { definition?: string; fromPaper?: boolean } | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}
