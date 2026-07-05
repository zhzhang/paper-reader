const UA =
  "Mozilla/5.0 (compatible; paper-reader/0.1; +https://localhost) AppleWebKit/537.36";

export interface ArxivRef {
  /** Bare id, e.g. "1706.03762" or "hep-th/9901001" */
  id: string;
  /** Optional version suffix, e.g. "v7" (without the leading slash). */
  version?: string;
}

const NEW_ID = /(\d{4}\.\d{4,5})(v\d+)?/i;
const OLD_ID = /([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?/i;

/**
 * Accept arxiv links (abs/pdf/html), bare ids, with or without version,
 * and normalize to { id, version }.
 */
export function normalizeArxivId(input: string): ArxivRef | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // Strip a possible URL wrapper but keep the path for the regexes below.
  let candidate = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      candidate = u.pathname + u.search;
    }
  } catch {
    // not a URL, fall through
  }

  const m = candidate.match(NEW_ID) ?? candidate.match(OLD_ID);
  if (!m) return null;

  return {
    id: m[1],
    version: m[2] ? m[2].toLowerCase() : undefined,
  };
}

export interface FetchedPdf {
  pdf: Buffer;
  sourceUrl: string;
}

async function tryFetchPdf(url: string): Promise<Buffer | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/pdf" },
      redirect: "follow",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5) return null;
  if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF")) return null;
  return buf;
}

/** Fetch the arXiv PDF for a paper. */
export async function fetchPaperPdf(ref: ArxivRef): Promise<FetchedPdf> {
  const withVersion = `${ref.id}${ref.version ?? ""}`;

  const candidates: string[] = [
    `https://arxiv.org/pdf/${withVersion}`,
    `https://arxiv.org/pdf/${ref.id}`,
  ];

  for (const url of candidates) {
    const pdf = await tryFetchPdf(url);
    if (pdf) return { pdf, sourceUrl: url };
  }

  throw new Error(`No PDF found for arxiv:${withVersion}.`);
}

/** Fetch lightweight metadata via the arxiv Atom API (title/authors/abstract). */
export interface ArxivMeta {
  title: string;
  authors: string[];
  abstract: string;
}

export async function fetchArxivMeta(ref: ArxivRef): Promise<ArxivMeta | null> {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(ref.id)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const xml = await res.text();

  const entry = xml.slice(xml.indexOf("<entry>"));
  if (!entry) return null;

  const pick = (tag: string) => {
    const m = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
  };

  const title = pick("title");
  const abstract = pick("summary");
  const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/gi)].map(
    (a) => decodeEntities(a[1].trim()),
  );

  if (!title) return null;
  return { title, authors, abstract };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
