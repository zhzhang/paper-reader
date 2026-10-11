import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  getAnthropicClient,
  getModel,
  hasApiKey,
  pdfDocumentBlock,
} from "@/lib/anthropic";

export const instant = false;

const bodySchema = z.object({
  question: z.string().min(1),
  quote: z.string().optional().nullable(),
  quotePage: z.number().optional().nullable(),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/papers/[id]/chat">,
) {
  const { id } = await ctx.params;
  if (!hasApiKey()) {
    return Response.json(
      { error: "Set ANTHROPIC_API_KEY in .env.local to enable chat." },
      { status: 400 },
    );
  }

  const paper = db.select().from(schema.papers).where(eq(schema.papers.id, id)).get();
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const client = getAnthropicClient()!;
  const glossary = db
    .select()
    .from(schema.glossary)
    .where(eq(schema.glossary.paperId, id))
    .all();

  const history = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.paperId, id))
    .orderBy(asc(schema.messages.createdAt))
    .all();

  const userText = [
    parsed.data.quote
      ? `Selected on page ${parsed.data.quotePage ?? "?"}: "${parsed.data.quote}"`
      : null,
    parsed.data.question,
  ]
    .filter(Boolean)
    .join("\n\n");

  db.insert(schema.messages)
    .values({
      paperId: id,
      role: "user",
      content: userText,
      quote: parsed.data.quote ?? null,
      quotePage: parsed.data.quotePage ?? null,
      createdAt: new Date(),
    })
    .run();

  const glossaryText =
    glossary.length === 0
      ? "No glossary available."
      : glossary
          .map(
            (g) =>
              `- ${g.symbolUnicode}${g.symbolLatex ? ` ($${g.symbolLatex}$)` : ""}: ${g.name} — ${g.definition}`,
          )
          .join("\n");

  type Msg = { role: "user" | "assistant"; content: string | Array<unknown> };
  const messages: Msg[] = [];

  // Cached paper prefix as first user turn
  messages.push({
    role: "user",
    content: [
      pdfDocumentBlock(paper.filePath, { cache: true }),
      {
        type: "text",
        text: `Paper title: ${paper.title}\n\nSymbol glossary:\n${glossaryText}\n\nAcknowledge that you have the paper and are ready for questions. Reply with just "Ready."`,
      },
    ],
  });
  messages.push({ role: "assistant", content: "Ready." });

  for (const m of history) {
    const text =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    messages.push({ role: m.role, content: text });
  }
  messages.push({ role: "user", content: userText });

  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 4096,
    system: `You are a research paper reading assistant. Answer questions about the attached paper using its content. Cite page numbers. Use LaTeX with $...$ for math. Be precise and concise.`,
    messages: messages as Parameters<typeof client.messages.stream>[0]["messages"],
  });

  const encoder = new TextEncoder();
  let fullText = "";
  const citations: unknown[] = [];

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "text", text: event.delta.text }) + "\n",
              ),
            );
          }
          if (
            event.type === "content_block_delta" &&
            // @ts-expect-error citations_delta exists when citations enabled
            event.delta.type === "citations_delta"
          ) {
            // @ts-expect-error citation on delta
            const citation = event.delta.citation;
            citations.push(citation);
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "citation", citation }) + "\n",
              ),
            );
          }
        }

        db.insert(schema.messages)
          .values({
            paperId: id,
            role: "assistant",
            content: { text: fullText, citations },
            createdAt: new Date(),
          })
          .run();

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
