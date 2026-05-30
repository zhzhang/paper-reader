import { NextResponse } from "next/server";
import { resolveReference } from "@/lib/resolve";
import { IngestError } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const reference = await resolveReference(id);
    return NextResponse.json({ reference });
  } catch (err) {
    const status = err instanceof IngestError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to resolve reference.";
    return NextResponse.json({ error: message }, { status });
  }
}
