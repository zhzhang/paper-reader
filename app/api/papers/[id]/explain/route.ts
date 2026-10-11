import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getAnthropicClient, getModel, hasApiKey } from "@/lib/anthropic";

export const instant = false;

const bodySchema = z.object({
  formulaText: z.string().min(1),
  pageNumber: z.number(),
  context: z.string().optional().default(""),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/papers/[id]/explain">,
) {
  const { id } = await ctx.params;
  if (!hasApiKey()) {
    return Response.json(
      { error: "Set ANTHROPIC_API_KEY in .env.local" },
      { status: 400 },
    );
  }

  const paper = db
    .select({ title: schema.papers.title })
    .from(schema.papers)
    .where(eq(schema.papers.id, id))
    .get();
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const client = getAnthropicClient()!;
  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 512,
    // @ts-expect-error effort is supported on current models
    effort: "low",
    system: `Briefly explain mathematical notation from the paper "${paper.title}". Use $...$ for math. Keep the answer under 120 words.`,
    messages: [
      {
        role: "user",
        content: `On page ${parsed.data.pageNumber}, explain this formula/notation:\n\n${parsed.data.formulaText}\n\nSurrounding context:\n${parsed.data.context.slice(0, 2000)}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "text", text: event.delta.text }) + "\n",
              ),
            );
          }
        }
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
        );
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", error: message }) + "\n",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
