import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export const instant = false;

const createSchema = z.object({
  pageNumber: z.number().int().positive(),
  rects: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  ),
  quote: z.string().default(""),
  body: z.string().default(""),
});

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/papers/[id]/notes">,
) {
  const { id } = await ctx.params;
  const rows = db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.paperId, id))
    .all();
  return Response.json(rows);
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/papers/[id]/notes">,
) {
  const { id } = await ctx.params;
  const paper = db
    .select({ id: schema.papers.id })
    .from(schema.papers)
    .where(eq(schema.papers.id, id))
    .get();
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const now = new Date();
  const result = db
    .insert(schema.notes)
    .values({
      paperId: id,
      pageNumber: parsed.data.pageNumber,
      rects: parsed.data.rects,
      quote: parsed.data.quote,
      body: parsed.data.body,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return Response.json(result, { status: 201 });
}
