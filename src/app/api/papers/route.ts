import { NextResponse } from "next/server";
import { listRecentPapers } from "@/lib/db";
import { ingestPaper, IngestError } from "@/lib/ingest";

export const runtime = "nodejs";

// List recently opened papers.
export async function GET() {
  return NextResponse.json({ papers: listRecentPapers(30) });
}

// Ingest a paper by arxiv link/id.
export async function POST(req: Request) {
  let input: string | undefined;
  try {
    const body = await req.json();
    input = body?.input;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Missing 'input'." }, { status: 400 });
  }

  try {
    const paper = await ingestPaper(input);
    return NextResponse.json({
      id: paper.id,
      arxivId: paper.arxivId,
      title: paper.title,
      authors: paper.authors,
    });
  } catch (err) {
    const status = err instanceof IngestError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to ingest paper.";
    return NextResponse.json({ error: message }, { status });
  }
}
