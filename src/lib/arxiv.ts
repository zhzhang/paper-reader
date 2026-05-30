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

export interface FetchedHtml {
  html: string;
  sourceUrl: string;
}

async function tryFetch(url: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = await res.text();
  // arxiv serves a small placeholder when no HTML rendition exists.
  if (text.length < 2000) return null;
  if (/No HTML available|HTML is not available/i.test(text.slice(0, 5000))) {
    return null;
  }
  return text;
}

/**
 * Fetch the LaTeXML HTML rendition for a paper, preferring arxiv's native
 * HTML and falling back to ar5iv (which covers the historical corpus).
 */
export async function fetchPaperHtml(ref: ArxivRef): Promise<FetchedHtml> {
  const withVersion = `${ref.id}${ref.version ?? ""}`;

  const candidates: string[] = [
    `https://arxiv.org/html/${withVersion}`,
    `https://arxiv.org/html/${ref.id}`,
    `https://ar5iv.labs.arxiv.org/html/${withVersion}`,
    `https://ar5iv.labs.arxiv.org/html/${ref.id}`,
  ];

  for (const url of candidates) {
    const html = await tryFetch(url);
    if (html) return { html, sourceUrl: url };
  }

  throw new Error(
    `No HTML rendition found for arxiv:${withVersion}. The paper may be too old or HTML conversion may have failed.`,
  );
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
