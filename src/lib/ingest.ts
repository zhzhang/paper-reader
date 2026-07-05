import {
  createPaperWithReferences,
  getPaperByArxivId,
  type PaperRow,
} from "@/lib/db";
import {
  fetchArxivMeta,
  fetchPaperPdf,
  normalizeArxivId,
  type ArxivRef,
} from "@/lib/arxiv";
import { extractPdfInfo } from "@/lib/pdf-refs";

/**
 * Ingest a paper by arxiv link/id. Returns the existing record if already
 * stored, otherwise fetches the PDF, extracts references, and persists it.
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

  const { pdf, sourceUrl } = await fetchPaperPdf(ref);
  const { numPages, references } = await extractPdfInfo(pdf);

  const meta = await fetchArxivMeta(ref).catch(() => null);

  const title = meta?.title || `arXiv:${ref.id}`;
  const authors =
    meta?.authors && meta.authors.length
      ? meta.authors.join("; ")
      : null;
  const abstract = meta?.abstract ?? null;

  console.log(`Ingested ${ref.id}: ${references.length} references from PDF`);

  return createPaperWithReferences(
    {
      arxivId: ref.id,
      version: ref.version ?? null,
      title,
      authors,
      abstract,
      pdf,
      numPages,
      sourceUrl,
    },
    references,
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
