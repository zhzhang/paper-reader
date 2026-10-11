import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchArxivMeta, parseArxivId } from "@/lib/arxiv";
import { resolveByDoi, resolveByTitle } from "@/lib/semantic-scholar";

export const instant = false;

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/references/[id]/resolve">,
) {
  const { id } = await ctx.params;
  const refId = Number(id);
  const ref = db
    .select()
    .from(schema.references)
    .where(eq(schema.references.id, refId))
    .get();
  if (!ref) return Response.json({ error: "Not found" }, { status: 404 });

  if (ref.abstract && ref.resolvedPdfUrl) {
    return Response.json(ref);
  }

  let abstract = ref.abstract;
  let resolvedPdfUrl = ref.resolvedPdfUrl;
  let title = ref.title;
  let year = ref.year;
  let doi = ref.doi;
  let arxivId = ref.arxivId;
  let authors = ref.authors ?? [];

  try {
    const arxivFromDoi = doi?.match(/arxiv\.(\d{4}\.\d{4,5})/i)?.[1];
    if (arxivFromDoi && !arxivId) arxivId = arxivFromDoi;

    if (arxivId || (ref.url && parseArxivId(ref.url))) {
      const aid = arxivId ?? parseArxivId(ref.url!)!;
      const meta = await fetchArxivMeta(aid);
      abstract = abstract ?? meta.abstract;
      resolvedPdfUrl = resolvedPdfUrl ?? meta.pdfUrl;
      title = title ?? meta.title;
      authors = authors.length ? authors : meta.authors;
      arxivId = aid;
    } else if (doi) {
      const resolved = await resolveByDoi(doi);
      if (resolved) {
        abstract = abstract ?? resolved.abstract;
        resolvedPdfUrl =
          resolvedPdfUrl ??
          resolved.pdfUrl ??
          (resolved.arxivId
            ? `https://arxiv.org/pdf/${resolved.arxivId}`
            : null);
        title = title ?? resolved.title;
        year = year ?? resolved.year;
        authors = authors.length ? authors : resolved.authors;
        arxivId = arxivId ?? resolved.arxivId;
      }
    } else {
      const query =
        expandBibKey(title) ||
        expandBibKey(ref.rawText) ||
        expandBibKey(ref.destName?.replace(/^cite\./i, "") ?? null) ||
        title ||
        ref.rawText;
      if (query) {
        const loose = Boolean(
          expandBibKey(title) ||
            expandBibKey(ref.rawText) ||
            expandBibKey(ref.destName?.replace(/^cite\./i, "") ?? null),
        );
        const resolved = await resolveByTitle(query, { loose });
        if (resolved) {
          abstract = abstract ?? resolved.abstract;
          resolvedPdfUrl =
            resolvedPdfUrl ??
            resolved.pdfUrl ??
            (resolved.arxivId
              ? `https://arxiv.org/pdf/${resolved.arxivId}`
              : null);
          // Prefer a real paper title over a bibtex key.
          if (resolved.title && looksLikeBibKey(title)) {
            title = resolved.title;
          } else {
            title = title ?? resolved.title;
          }
          year = year ?? resolved.year;
          doi = doi ?? resolved.doi;
          arxivId = arxivId ?? resolved.arxivId;
          authors = authors.length ? authors : resolved.authors;
          if (!arxivId && resolved.arxivId) arxivId = resolved.arxivId;
          if (!arxivId && resolved.doi) {
            arxivId = resolved.doi.match(/arxiv\.(\d{4}\.\d{4,5})/i)?.[1] ?? null;
          }
        }
      }
    }

    // Prefer arXiv abstract when available (OpenAlex abstracts are sometimes wrong).
    if (arxivId && (!abstract || abstractLooksWrong(abstract, title))) {
      try {
        const meta = await fetchArxivMeta(arxivId);
        abstract = meta.abstract || abstract;
        resolvedPdfUrl = resolvedPdfUrl ?? meta.pdfUrl;
        if (looksLikeBibKey(title) && meta.title) title = meta.title;
        if (!authors.length) authors = meta.authors;
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error("resolve failed", err);
  }

  const updated = db
    .update(schema.references)
    .set({
      abstract,
      resolvedPdfUrl,
      title,
      year,
      doi,
      arxivId,
      authors,
    })
    .where(eq(schema.references.id, refId))
    .returning()
    .get();

  return Response.json(updated);
}

function looksLikeBibKey(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[a-z][a-zA-Z]*\d{4}[a-zA-Z0-9]*$/.test(s.trim());
}

/** Turn he2016deep → "He deep 2016" for Semantic Scholar search. */
function expandBibKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const key = s.trim().replace(/^cite\./i, "");
  const m = key.match(/^([A-Za-z]+)(\d{4})([A-Za-z0-9]*)$/);
  if (!m) return looksLikeBibKey(key) ? key : null;
  const author = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const rest = m[3].replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${author} ${rest} ${m[2]}`.replace(/\s+/g, " ").trim();
}

function abstractLooksWrong(abstract: string, title: string | null): boolean {
  if (!abstract || abstract.length < 40) return true;
  if (!title || looksLikeBibKey(title)) return false;
  // If almost no title tokens appear in the abstract, treat it as suspect.
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (tokens.length < 2) return false;
  const abs = abstract.toLowerCase();
  const hits = tokens.filter((t) => abs.includes(t)).length;
  return hits / tokens.length < 0.25;
}
