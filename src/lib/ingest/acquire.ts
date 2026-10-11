import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pdfsDir } from "@/db";
import {
  fetchArxivMeta,
  isArxivInput,
  parseArxivId,
  type ArxivMeta,
} from "@/lib/arxiv";

const MAX_BYTES = 50 * 1024 * 1024;

export type Acquired = {
  filePath: string;
  source: "upload" | "arxiv" | "url";
  sourceUrl: string | null;
  arxivId: string | null;
  title: string | null;
  authors: string[];
  bytes: Uint8Array;
};

export async function acquireFromUpload(
  id: string,
  file: File,
): Promise<Acquired> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("PDF exceeds 50 MB limit");
  if (!looksLikePdf(buf)) throw new Error("Uploaded file is not a PDF");
  const filePath = join(pdfsDir, `${id}.pdf`);
  writeFileSync(filePath, buf);
  return {
    filePath,
    source: "upload",
    sourceUrl: null,
    arxivId: null,
    title: file.name.replace(/\.pdf$/i, "") || null,
    authors: [],
    bytes: buf,
  };
}

export async function acquireFromUrl(id: string, url: string): Promise<Acquired> {
  if (isArxivInput(url)) {
    const arxivId = parseArxivId(url)!;
    const meta = await fetchArxivMeta(arxivId);
    return acquireArxiv(id, meta);
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "paper-reader/0.1" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to download URL: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("PDF exceeds 50 MB limit");
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("pdf") && !looksLikePdf(buf)) {
    throw new Error("URL did not return a PDF (got HTML or another type)");
  }
  if (!looksLikePdf(buf)) throw new Error("Downloaded file is not a PDF");
  const filePath = join(pdfsDir, `${id}.pdf`);
  writeFileSync(filePath, buf);
  return {
    filePath,
    source: "url",
    sourceUrl: url,
    arxivId: null,
    title: null,
    authors: [],
    bytes: buf,
  };
}

async function acquireArxiv(id: string, meta: ArxivMeta): Promise<Acquired> {
  const res = await fetch(meta.pdfUrl, {
    headers: { "User-Agent": "paper-reader/0.1" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to download arXiv PDF: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("PDF exceeds 50 MB limit");
  if (!looksLikePdf(buf)) throw new Error("arXiv download is not a PDF");
  const filePath = join(pdfsDir, `${id}.pdf`);
  writeFileSync(filePath, buf);
  return {
    filePath,
    source: "arxiv",
    sourceUrl: `https://arxiv.org/abs/${meta.arxivId}`,
    arxivId: meta.arxivId,
    title: meta.title,
    authors: meta.authors,
    bytes: buf,
  };
}

function looksLikePdf(buf: Uint8Array): boolean {
  if (buf.byteLength < 5) return false;
  return (
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46
  ); // %PDF
}
