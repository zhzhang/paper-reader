import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { db, schema } from "@/db";

export const instant = false;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/papers/[id]/pdf">,
) {
  const { id } = await ctx.params;
  const paper = db
    .select({ filePath: schema.papers.filePath })
    .from(schema.papers)
    .where(eq(schema.papers.id, id))
    .get();
  if (!paper) return new Response("Not found", { status: 404 });
  try {
    const buf = readFileSync(paper.filePath);
    return new Response(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("PDF missing", { status: 404 });
  }
}
