export type ArxivMeta = {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  pdfUrl: string;
};

const ARXIV_ID_RE =
  /(?:arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i;

export function parseArxivId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(ARXIV_ID_RE);
  if (!m) return null;
  return m[1].replace(/\.pdf$/i, "");
}

export function isArxivInput(input: string): boolean {
  return parseArxivId(input) != null && (/arxiv\.org/i.test(input) || /^\d{4}\.\d{4,5}/.test(input.trim()) || /^[a-z-]+\/\d{7}/i.test(input.trim()));
}

export async function fetchArxivMeta(arxivId: string): Promise<ArxivMeta> {
  const bare = arxivId.replace(/v\d+$/i, "");
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(bare)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv API failed: ${res.status}`);
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) throw new Error(`arXiv paper not found: ${arxivId}`);
  const block = entry[1];
  const title = decodeXml(
    block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "Untitled",
  );
  const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) =>
    decodeXml(m[1].trim()),
  );
  const abstract = decodeXml(
    block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "",
  );
  const idFromFeed =
    block.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/)?.[1] ?? arxivId;
  return {
    arxivId: idFromFeed,
    title,
    authors,
    abstract,
    pdfUrl: `https://arxiv.org/pdf/${idFromFeed}`,
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
