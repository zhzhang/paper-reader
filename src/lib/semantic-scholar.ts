export type ResolvedPaper = {
  title: string | null;
  abstract: string | null;
  year: number | null;
  authors: string[];
  doi: string | null;
  arxivId: string | null;
  pdfUrl: string | null;
};

function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const ta = new Set(normalize(a));
  const tb = new Set(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export async function resolveByDoi(doi: string): Promise<ResolvedPaper | null> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,abstract,externalIds,openAccessPdf,year,authors`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.ok) return mapS2(await res.json());
  return resolveOpenAlexByDoi(doi);
}

export async function resolveByTitle(
  title: string,
  opts?: { loose?: boolean },
): Promise<ResolvedPaper | null> {
  const loose = opts?.loose ?? false;
  const fromS2 = await searchSemanticScholar(title, loose);
  if (fromS2) return fromS2;
  return searchOpenAlex(title, loose);
}

async function searchSemanticScholar(
  title: string,
  loose: boolean,
): Promise<ResolvedPaper | null> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=5&fields=title,abstract,externalIds,openAccessPdf,year,authors`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: unknown[] };
  return pickBest(
    title,
    (data.data ?? []).map(mapS2),
    loose,
  );
}

async function searchOpenAlex(
  query: string,
  loose: boolean,
): Promise<ResolvedPaper | null> {
  const year = query.match(/\b((?:19|20)\d{2})\b/)?.[1];
  const params = new URLSearchParams({
    search: query,
    "per-page": "5",
  });
  if (year) params.set("filter", `publication_year:${year}`);

  const res = await fetch(`https://api.openalex.org/works?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "paper-reader/0.1 (mailto:dev@localhost)",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: OpenAlexWork[] };
  const mapped = (data.results ?? []).map(mapOpenAlex);
  return pickBest(query, mapped, loose);
}

async function resolveOpenAlexByDoi(doi: string): Promise<ResolvedPaper | null> {
  const res = await fetch(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "paper-reader/0.1 (mailto:dev@localhost)",
      },
    },
  );
  if (!res.ok) return null;
  return mapOpenAlex(await res.json());
}

function pickBest(
  query: string,
  candidates: ResolvedPaper[],
  loose: boolean,
): ResolvedPaper | null {
  let best: ResolvedPaper | null = null;
  let bestScore = 0;
  for (const mapped of candidates) {
    if (!mapped.title) continue;
    const score = titleSimilarity(query, mapped.title);
    if (score > bestScore) {
      bestScore = score;
      best = mapped;
    }
  }
  const threshold = loose ? 0.25 : 0.8;
  if (best && bestScore >= threshold) return best;
  if (!loose) return null;

  const yearMatch = query.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const authorToken = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  const ranked = candidates
    .filter((m) => m.title)
    .map((m) => {
      const hay = `${m.title} ${m.authors.join(" ")}`.toLowerCase();
      const yearOk = year == null || m.year === year;
      const authorOk = !authorToken || hay.includes(authorToken);
      let score = titleSimilarity(query, m.title!);
      if (yearOk) score += 0.5;
      if (authorOk) score += 0.4;
      // Prefer longer/more specific titles when scores tie (GAN vs short notes)
      score += Math.min((m.title?.length ?? 0) / 200, 0.2);
      return { m, score, yearOk, authorOk };
    })
    .filter((r) => r.yearOk && r.authorOk)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.m ?? null;
}

function mapS2(raw: unknown): ResolvedPaper {
  const p = raw as {
    title?: string;
    abstract?: string;
    year?: number;
    authors?: { name?: string }[];
    externalIds?: { DOI?: string; ArXiv?: string };
    openAccessPdf?: { url?: string };
  };
  return {
    title: p.title ?? null,
    abstract: p.abstract ?? null,
    year: p.year ?? null,
    authors: (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
    doi: p.externalIds?.DOI ?? null,
    arxivId: p.externalIds?.ArXiv ?? null,
    pdfUrl: p.openAccessPdf?.url ?? null,
  };
}

type OpenAlexWork = {
  title?: string;
  publication_year?: number;
  doi?: string | null;
  ids?: { doi?: string; arxiv?: string };
  authorships?: { author?: { display_name?: string } }[];
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: { pdf_url?: string | null };
  open_access?: { oa_url?: string | null };
};

function mapOpenAlex(work: OpenAlexWork): ResolvedPaper {
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//i, "") ??
    work.ids?.doi?.replace(/^https?:\/\/doi\.org\//i, "") ??
    null;
  let arxivId =
    work.ids?.arxiv?.replace(/^https?:\/\/arxiv\.org\/abs\//i, "") ?? null;
  const arxivFromDoi = doi?.match(/arxiv\.(\d{4}\.\d{4,5})/i)?.[1];
  if (!arxivId && arxivFromDoi) arxivId = arxivFromDoi;
  return {
    title: work.title ?? null,
    abstract: invertAbstract(work.abstract_inverted_index),
    year: work.publication_year ?? null,
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name ?? "")
      .filter(Boolean),
    doi,
    arxivId,
    pdfUrl:
      work.primary_location?.pdf_url ??
      work.open_access?.oa_url ??
      (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
  };
}

function invertAbstract(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}
