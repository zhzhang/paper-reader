import "@/lib/pdf-polyfills";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { NewReference } from "@/lib/db";

const ARXIV_IN_TEXT = /arxiv[:.\s/]*(\d{4}\.\d{4,5})/i;

interface TextItem {
  str: string;
  hasEOL?: boolean;
  transform: number[];
}

interface CiteEntry {
  bibKey: string;
  pageIndex: number;
  anchorIndex: number;
}

async function loadPdf(data: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  return pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
}

function anchorIndexForDest(items: TextItem[], x: number, y: number): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  let found = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ix = item.transform[4];
    const iy = item.transform[5];
    if (iy > y + 5) continue;
    const dist = Math.hypot(ix - x, iy - y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
      found = true;
    }
  }

  return found ? bestIndex : 0;
}

function collectRawText(
  pageItems: Map<number, TextItem[]>,
  start: CiteEntry,
  next: CiteEntry | null,
  numPages: number,
): string {
  const parts: string[] = [];
  let charCount = 0;
  const maxChars = 1500;
  let pageIndex = start.pageIndex;
  let itemIndex = start.anchorIndex;
  let pagesUsed = 0;

  while (pageIndex < numPages) {
    const items = pageItems.get(pageIndex);
    if (!items) break;

    while (itemIndex < items.length) {
      if (
        next &&
        pageIndex === next.pageIndex &&
        itemIndex >= next.anchorIndex
      ) {
        return parts.join(" ").replace(/\s+/g, " ").trim();
      }

      const item = items[itemIndex];
      if (parts.length > 0) parts.push(" ");
      parts.push(item.str);
      charCount += item.str.length + 1;
      if (item.hasEOL && parts.length > 0) parts.push(" ");

      if (charCount >= maxChars) {
        return parts.join(" ").replace(/\s+/g, " ").trim();
      }

      itemIndex++;
    }

    pagesUsed++;
    if (!next && pagesUsed >= 2) break;

    pageIndex++;
    itemIndex = 0;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function extractPdfInfo(data: Buffer): Promise<{
  numPages: number;
  references: NewReference[];
}> {
  const doc = await loadPdf(data);
  const numPages = doc.numPages;

  try {
    const dests = await doc.getDestinations();
    const citeKeys = Object.keys(dests).filter((k) => k.startsWith("cite."));
    if (citeKeys.length === 0) {
      return { numPages, references: [] };
    }

    const pending: Array<{
      bibKey: string;
      pageIndex: number;
      x: number;
      y: number;
    }> = [];

    for (const bibKey of citeKeys) {
      const d = dests[bibKey] as unknown[];
      if (!Array.isArray(d) || d.length < 1) continue;

      const pageIndex = await doc.getPageIndex(
        d[0] as Parameters<typeof doc.getPageIndex>[0],
      );
      const x = typeof d[2] === "number" ? d[2] : 0;
      const y = typeof d[3] === "number" ? d[3] : Infinity;
      pending.push({ bibKey, pageIndex, x, y });
    }

    const pageIndices = [...new Set(pending.map((e) => e.pageIndex))];
    const pageItems = new Map<number, TextItem[]>();
    for (const pageIndex of pageIndices) {
      const page = await doc.getPage(pageIndex + 1);
      const tc = await page.getTextContent();
      pageItems.set(pageIndex, tc.items as TextItem[]);
    }

    const entries: CiteEntry[] = pending.map(({ bibKey, pageIndex, x, y }) => ({
      bibKey,
      pageIndex,
      anchorIndex: anchorIndexForDest(pageItems.get(pageIndex) ?? [], x, y),
    }));

    entries.sort((a, b) =>
      a.pageIndex !== b.pageIndex
        ? a.pageIndex - b.pageIndex
        : a.anchorIndex - b.anchorIndex,
    );

    const seen = new Set<string>();
    const references: NewReference[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (seen.has(entry.bibKey)) continue;
      seen.add(entry.bibKey);

      const next = i + 1 < entries.length ? entries[i + 1] : null;
      const rawText = collectRawText(pageItems, entry, next, numPages);
      const arxivMatch = rawText.match(ARXIV_IN_TEXT);

      references.push({
        bibKey: entry.bibKey,
        rawText,
        title: null,
        resolvedArxivId: arxivMatch?.[1] ?? null,
        status: arxivMatch ? "resolved" : "pending",
      });
    }

    return { numPages, references };
  } finally {
    await doc.destroy();
  }
}
