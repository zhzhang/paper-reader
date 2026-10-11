import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export const instant = false;

const patchSchema = z.object({
  body: z.string().optional(),
  quote: z.string().optional(),
});

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/notes/[id]">,
) {
  const { id } = await ctx.params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const updated = db
    .update(schema.notes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.notes.id, noteId))
    .returning()
    .get();

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/notes/[id]">,
) {
  const { id } = await ctx.params;
  const noteId = Number(id);
  db.delete(schema.notes).where(eq(schema.notes.id, noteId)).run();
  return new Response(null, { status: 204 });
}
