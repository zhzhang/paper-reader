import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { startIngestFromUpload, startIngestFromUrl } from "@/lib/ingest";
import { z } from "zod";

export const instant = false;

export async function GET() {
  const rows = db
    .select({
      id: schema.papers.id,
      title: schema.papers.title,
      authors: schema.papers.authors,
      source: schema.papers.source,
      sourceUrl: schema.papers.sourceUrl,
      arxivId: schema.papers.arxivId,
      pageCount: schema.papers.pageCount,
      status: schema.papers.status,
      error: schema.papers.error,
      createdAt: schema.papers.createdAt,
    })
    .from(schema.papers)
    .orderBy(desc(schema.papers.createdAt))
    .all();
  return Response.json(rows);
}

export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "Missing file" }, { status: 400 });
      }
      const id = await startIngestFromUpload(file);
      return Response.json({ id }, { status: 201 });
    }

    const body = await request.json();
    const parsed = z.object({ url: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Expected { url }" }, { status: 400 });
    }
    const id = await startIngestFromUrl(parsed.data.url);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
