import {
  createPaperWithReferences,
  getPaperByArxivId,
  type PaperRow,
} from "@/lib/db";
import {
  fetchArxivMeta,
  fetchPaperHtml,
  normalizeArxivId,
  type ArxivRef,
} from "@/lib/arxiv";
import { parsePaper } from "@/lib/parse";

/**
 * Ingest a paper by arxiv link/id. Returns the existing record if already
 * stored, otherwise fetches the HTML rendition, parses it, and persists it
 * along with its bibliography references.
 */
export async function ingestPaper(input: string): Promise<PaperRow> {
  const ref = normalizeArxivId(input);
  if (!ref) {
    throw new IngestError("Could not recognize an arxiv id or link in the input.", 400);
  }

  const existing = getPaperByArxivId(ref.id);
  if (existing) return existing;

  return ingestRef(ref);
}

export async function ingestRef(ref: ArxivRef): Promise<PaperRow> {
  const existing = getPaperByArxivId(ref.id);
  if (existing) return existing;

  const { html, sourceUrl } = await fetchPaperHtml(ref);
  const parsed = parsePaper(html, sourceUrl);

  // Prefer clean metadata from the arxiv API; fall back to parsed values.
  const meta = await fetchArxivMeta(ref).catch(() => null);

  const title = meta?.title || parsed.title;
  const authors =
    meta?.authors && meta.authors.length
      ? meta.authors.join("; ")
      : parsed.authors.join("; ");
  const abstract =
    meta?.abstract || parsed.abstract.replace(/^Abstract\s*/i, "").trim();

  return createPaperWithReferences(
    {
      arxivId: ref.id,
      version: ref.version ?? null,
      title,
      authors,
      abstract,
      html: parsed.bodyHtml,
      sourceUrl,
    },
    parsed.references.map((r) => ({
      bibKey: r.bibKey,
      rawText: r.rawText,
      title: r.title ?? null,
      resolvedArxivId: r.arxivId ?? null,
      status: r.arxivId ? "resolved" : "pending",
    })),
  );
}

export class IngestError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
    this.name = "IngestError";
  }
}
