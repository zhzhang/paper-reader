import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const instant = false;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/papers/[id]">,
) {
  const { id } = await ctx.params;
  const paper = db
    .select()
    .from(schema.papers)
    .where(eq(schema.papers.id, id))
    .get();
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const pages = db
    .select({
      pageNumber: schema.pages.pageNumber,
      width: schema.pages.width,
      height: schema.pages.height,
    })
    .from(schema.pages)
    .where(eq(schema.pages.paperId, id))
    .all();

  const formulas = db
    .select()
    .from(schema.formulaSpans)
    .where(eq(schema.formulaSpans.paperId, id))
    .all();

  const links = db
    .select()
    .from(schema.links)
    .where(eq(schema.links.paperId, id))
    .all();

  const glossary = db
    .select()
    .from(schema.glossary)
    .where(eq(schema.glossary.paperId, id))
    .all();

  const references = db
    .select()
    .from(schema.references)
    .where(eq(schema.references.paperId, id))
    .all();

  const notes = db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.paperId, id))
    .all();

  const messages = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.paperId, id))
    .all();

  const { filePath: _fp, ...safe } = paper;
  return Response.json({
    ...safe,
    pages,
    formulas,
    links,
    glossary,
    references,
    notes,
    messages,
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/papers/[id]">,
) {
  const { id } = await ctx.params;
  db.delete(schema.papers).where(eq(schema.papers.id, id)).run();
  return new Response(null, { status: 204 });
}
