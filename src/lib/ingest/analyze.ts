import { z } from "zod";
import { getAnthropicClient, getModel, pdfDocumentBlock } from "@/lib/anthropic";

const analysisSchema = z.object({
  glossary: z.array(
    z.object({
      symbolUnicode: z.string(),
      symbolLatex: z.string().optional().nullable(),
      name: z.string(),
      definition: z.string(),
      pages: z.array(z.number()).optional().default([]),
    }),
  ),
  references: z.array(
    z.object({
      label: z.string(),
      rawText: z.string().optional().default(""),
      title: z.string().optional().nullable(),
      authors: z.array(z.string()).optional().default([]),
      year: z.number().optional().nullable(),
      doi: z.string().optional().nullable(),
      arxivId: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
    }),
  ),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

const TOOL = {
  name: "record_paper_analysis",
  description:
    "Record the symbol glossary and bibliography extracted from the paper.",
  input_schema: {
    type: "object" as const,
    properties: {
      glossary: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbolUnicode: {
              type: "string",
              description: "Unicode representation of the symbol or variable",
            },
            symbolLatex: { type: "string", description: "LaTeX form if known" },
            name: { type: "string", description: "Short name of the symbol" },
            definition: {
              type: "string",
              description:
                "One-sentence definition grounded in this paper; may use $...$ for math",
            },
            pages: {
              type: "array",
              items: { type: "number" },
              description: "Pages where the symbol is important",
            },
          },
          required: ["symbolUnicode", "name", "definition"],
        },
      },
      references: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Citation label like 12 or Smith2020",
            },
            rawText: { type: "string" },
            title: { type: "string" },
            authors: { type: "array", items: { type: "string" } },
            year: { type: "number" },
            doi: { type: "string" },
            arxivId: { type: "string" },
            url: { type: "string" },
          },
          required: ["label"],
        },
      },
    },
    required: ["glossary", "references"],
  },
};

export async function analyzePaper(opts: {
  filePath: string;
  title: string;
  pageCount: number;
  pageTexts: string[];
  formulaTexts: string[];
}): Promise<AnalysisResult> {
  const client = getAnthropicClient();
  if (!client) {
    return fallbackAnalysis(opts.formulaTexts);
  }

  const formulaList =
    opts.formulaTexts.slice(0, 200).map((t, i) => `${i + 1}. ${t}`).join("\n") ||
    "(none detected)";

  const prompt = `Analyze this research paper titled "${opts.title}".

Extract:
1. A glossary of important mathematical symbols and variables defined or used in the paper. Prefer symbols that appear in the formula spans listed below. Definitions must be grounded in THIS paper.
2. The bibliography / references list with labels matching how they are cited in the paper (e.g. "12" for [12], or author-year keys).

Formula spans detected in the PDF:
${formulaList}

Call the record_paper_analysis tool with your findings.`;

  const content: Array<
    | ReturnType<typeof pdfDocumentBlock>
    | { type: "text"; text: string }
  > = [];

  if (opts.pageCount <= 100) {
    try {
      content.push(pdfDocumentBlock(opts.filePath));
    } catch {
      content.push({
        type: "text",
        text: opts.pageTexts.join("\n\n--- page break ---\n\n").slice(0, 400_000),
      });
    }
  } else {
    content.push({
      type: "text",
      text: opts.pageTexts.join("\n\n--- page break ---\n\n").slice(0, 400_000),
    });
  }
  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 8192,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_paper_analysis" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { glossary: [], references: [] };
  }

  const parsed = analysisSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("Analysis schema mismatch", parsed.error);
    return { glossary: [], references: [] };
  }
  return parsed.data;
}

/** Minimal glossary when ANTHROPIC_API_KEY is unset — still enables hover. */
function fallbackAnalysis(formulaTexts: string[]): AnalysisResult {
  const counts = new Map<string, number>();
  for (const t of formulaTexts) {
    for (const ch of t) {
      const code = ch.codePointAt(0) ?? 0;
      const interesting =
        (code >= 0x0370 && code <= 0x03ff) ||
        (code >= 0x2200 && code <= 0x22ff) ||
        /[A-Za-z]/.test(ch);
      if (!interesting) continue;
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  const glossary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([symbolUnicode, n]) => ({
      symbolUnicode,
      symbolLatex: null as string | null,
      name: `Symbol ${symbolUnicode}`,
      definition: `Appears in formulas in this paper (${n} occurrences). Set ANTHROPIC_API_KEY for grounded definitions.`,
      pages: [] as number[],
    }));
  return { glossary, references: [] };
}
