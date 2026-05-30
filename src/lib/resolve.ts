import { getReferenceById, updateReference } from "@/lib/db";
import { ingestRef, IngestError } from "@/lib/ingest";
import { fetchArxivMeta, normalizeArxivId } from "@/lib/arxiv";

export interface ResolvedReference {
  id: string;
  bibKey: string;
  rawText: string;
  title: string | null;
  status: string;
  resolvedArxivId: string | null;
  resolvedUrl: string | null;
  abstract: string | null;
  /** If the cited paper is available as a readable arxiv paper, its local id. */
  arxivPaperId?: string;
}

const UA =
  "Mozilla/5.0 (compatible; paper-reader/0.1; +https://localhost) AppleWebKit/537.36";

interface S2Match {
  title?: string;
  abstract?: string;
  url?: string;
  externalIds?: { ArXiv?: string; DOI?: string };
  openAccessPdf?: { url?: string };
}

async function searchSemanticScholar(query: string): Promise<S2Match | null> {
  const url =
    "https://api.semanticscholar.org/graph/v1/paper/search?" +
    new URLSearchParams({
      query,
      limit: "1",
      fields: "title,abstract,externalIds,url,openAccessPdf",
    });
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: S2Match[] };
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a bibliography reference: prefer an inline arxiv id (ingest the full
 * paper); otherwise search Semantic Scholar for metadata and any arxiv id.
 */
export async function resolveReference(
  referenceId: string,
): Promise<ResolvedReference> {
  const ref = getReferenceById(referenceId);
  if (!ref) throw new IngestError("Reference not found.", 404);

  let arxivId = ref.resolvedArxivId ?? null;
  let resolvedUrl = ref.resolvedUrl ?? null;
  let abstract = ref.abstract ?? null;
  let status = ref.status;

  // Look up via Semantic Scholar when we don't yet have an arxiv id.
  if (!arxivId && (ref.title || ref.rawText)) {
    const match = await searchSemanticScholar(ref.title || ref.rawText.slice(0, 300));
    if (match) {
      if (match.externalIds?.ArXiv) {
        const norm = normalizeArxivId(match.externalIds.ArXiv);
        arxivId = norm?.id ?? match.externalIds.ArXiv;
      }
      resolvedUrl =
        match.url ||
        match.openAccessPdf?.url ||
        (match.externalIds?.DOI ? `https://doi.org/${match.externalIds.DOI}` : null) ||
        resolvedUrl;
      abstract = match.abstract ?? abstract;
      status = arxivId || resolvedUrl ? "resolved" : "not_found";
    } else {
      status = "not_found";
    }
  }

  // Try to ingest the cited arxiv paper for in-app reading.
  let arxivPaperId: string | undefined;
  if (arxivId) {
    const norm = normalizeArxivId(arxivId);
    if (norm) {
      try {
        const cited = await ingestRef(norm);
        arxivPaperId = cited.id;
        if (!resolvedUrl) resolvedUrl = `https://arxiv.org/abs/${norm.id}`;
        if (!abstract) abstract = cited.abstract;
        status = "resolved";
      } catch {
        // HTML not available: still offer the abstract/link.
        const meta = await fetchArxivMeta(norm).catch(() => null);
        if (meta && !abstract) abstract = meta.abstract;
        if (!resolvedUrl) resolvedUrl = `https://arxiv.org/abs/${norm.id}`;
        status = "resolved";
      }
    }
  }

  const updated = updateReference(referenceId, {
    resolvedArxivId: arxivId,
    resolvedUrl,
    abstract,
    status,
  });

  return {
    id: updated.id,
    bibKey: updated.bibKey,
    rawText: updated.rawText,
    title: updated.title,
    status: updated.status,
    resolvedArxivId: updated.resolvedArxivId,
    resolvedUrl: updated.resolvedUrl,
    abstract: updated.abstract,
    arxivPaperId,
  };
}
