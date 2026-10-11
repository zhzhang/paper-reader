import { getDocumentProxy, getMeta } from "unpdf";
import type { BBox } from "@/db/schema";
import { pdfItemToBBox, pdfRectToBBox, unionBBoxes } from "@/lib/geometry";

const MATH_FONT_RE =
  /^(CMMI|CMSY|CMEX|CMMIB|CMBSY|MSAM|MSBM|rsfs|eufm|LMMath|LatinModernMath|STIX.*Math|XITSMath|TeXGyre.*Math|Asana|CambriaMath|Symbol|MTExtra)/i;

export type ExtractedPage = {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
};

export type ExtractedFormula = {
  pageNumber: number;
  bbox: BBox;
  text: string;
  fontNames: string[];
  symbols: string[];
};

export type ExtractedLink = {
  pageNumber: number;
  bbox: BBox;
  kind: "uri" | "dest";
  url: string | null;
  destName: string | null;
  destPage: number | null;
  destX: number | null;
  destY: number | null;
};

export type ExtractionResult = {
  title: string | null;
  pageCount: number;
  pages: ExtractedPage[];
  formulas: ExtractedFormula[];
  links: ExtractedLink[];
};

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
};

function stripSubset(fontName: string): string {
  const plus = fontName.indexOf("+");
  return plus >= 0 ? fontName.slice(plus + 1) : fontName;
}

function isMathChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x0370 && code <= 0x03ff) return true; // Greek
  if (code >= 0x2200 && code <= 0x22ff) return true; // Math operators
  if (code >= 0x2a00 && code <= 0x2aff) return true;
  if (code >= 0x2070 && code <= 0x209f) return true; // super/sub
  if (code >= 0x1d400 && code <= 0x1d7ff) return true; // math alphanumeric
  return false;
}

function isMathItem(item: TextItem, realFont: string): boolean {
  if (MATH_FONT_RE.test(realFont)) return true;
  const chars = [...item.str].filter((c) => c.trim());
  if (chars.length === 0) return false;
  const mathCount = chars.filter(isMathChar).length;
  return mathCount / chars.length > 0.5;
}

function isAbsorbable(item: TextItem, realFont: string): boolean {
  if (/^CMR/i.test(realFont) || /^Times/i.test(realFont) || /^NimbusRom/i.test(realFont)) {
    return /^[\d\s.,=+\-*/()[\]{}|]+$/.test(item.str);
  }
  return false;
}

function extractSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) {
    if (isMathChar(ch) || /[A-Za-zα-ωΑ-Ω]/.test(ch)) out.add(ch);
  }
  return [...out];
}

export async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const pdf = await getDocumentProxy(bytes);
  const pageCount = pdf.numPages;
  let metaTitle: string | null = null;
  try {
    const meta = await getMeta(pdf);
    metaTitle = (meta.info?.Title as string | undefined)?.trim() || null;
  } catch {
    /* ignore */
  }

  const pages: ExtractedPage[] = [];
  const formulas: ExtractedFormula[] = [];
  const links: ExtractedLink[] = [];
  let largestFontText = "";
  let largestFontSize = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const view = page.view as number[];
    const width = view[2] - view[0];
    const height = view[3] - view[1];

    await page.getOperatorList();
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((it) => it.str != null);

    const pageTextParts: string[] = [];
    type Tagged = {
      item: TextItem;
      font: string;
      math: boolean;
      absorb: boolean;
      bbox: BBox;
      baseline: number;
    };
    const tagged: Tagged[] = [];

    for (const item of items) {
      pageTextParts.push(item.str);
      let font = item.fontName;
      try {
        const obj = page.commonObjs.get(item.fontName) as { name?: string } | undefined;
        if (obj?.name) font = stripSubset(obj.name);
      } catch {
        font = stripSubset(item.fontName);
      }
      const bbox = pdfItemToBBox(item.transform, item.width, item.height || 10, view);
      const math = isMathItem(item, font);
      const absorb = !math && isAbsorbable(item, font);
      tagged.push({
        item,
        font,
        math,
        absorb,
        bbox,
        baseline: item.transform[5],
      });
      if (i === 1 && item.height > largestFontSize && item.str.trim().length > 3) {
        largestFontSize = item.height;
        largestFontText = item.str.trim();
      }
    }

    // Group consecutive math (+ absorbable) items on same baseline
    let group: Tagged[] = [];
    const flush = () => {
      if (group.length === 0) return;
      const hasMath = group.some((g) => g.math);
      if (!hasMath) {
        group = [];
        return;
      }
      const text = group.map((g) => g.item.str).join("");
      if (!text.trim()) {
        group = [];
        return;
      }
      formulas.push({
        pageNumber: i,
        bbox: unionBBoxes(group.map((g) => g.bbox)),
        text,
        fontNames: [...new Set(group.map((g) => g.font))],
        symbols: extractSymbols(text),
      });
      group = [];
    };

    for (let j = 0; j < tagged.length; j++) {
      const t = tagged[j];
      if (t.math || (t.absorb && group.length > 0)) {
        if (
          group.length > 0 &&
          Math.abs(t.baseline - group[group.length - 1].baseline) > 2
        ) {
          flush();
        }
        group.push(t);
        // Peek ahead: if next is math after absorbables, keep going; else flush after absorb chain ends
        const next = tagged[j + 1];
        if (
          !t.math &&
          t.absorb &&
          (!next || (!next.math && !next.absorb) || Math.abs((next?.baseline ?? 0) - t.baseline) > 2)
        ) {
          // trailing absorb without following math — drop trailing absorbs
          while (group.length && !group[group.length - 1].math) group.pop();
          flush();
        }
      } else {
        flush();
      }
    }
    flush();

    pages.push({
      pageNumber: i,
      width,
      height,
      text: pageTextParts.join(""),
    });

    const annotations = await page.getAnnotations();
    for (const ann of annotations as Array<{
      subtype?: string;
      url?: string;
      dest?: string | unknown[];
      rect?: number[];
    }>) {
      if (ann.subtype !== "Link" || !ann.rect) continue;
      const bbox = pdfRectToBBox(ann.rect, view);
      if (ann.url) {
        links.push({
          pageNumber: i,
          bbox,
          kind: "uri",
          url: ann.url,
          destName: null,
          destPage: null,
          destX: null,
          destY: null,
        });
        continue;
      }
      let destName: string | null = null;
      let destPage: number | null = null;
      let destX: number | null = null;
      let destY: number | null = null;
      if (typeof ann.dest === "string") {
        destName = ann.dest;
        try {
          const dest = await pdf.getDestination(ann.dest);
          if (Array.isArray(dest) && dest[0]) {
            destPage = (await pdf.getPageIndex(dest[0])) + 1;
            // dest format: [ref, {name: XYZ}, x, y, zoom]
            if (typeof dest[2] === "number") destX = dest[2];
            if (typeof dest[3] === "number") destY = dest[3];
          }
        } catch {
          /* ignore unresolved dest */
        }
      } else if (Array.isArray(ann.dest) && ann.dest[0]) {
        try {
          destPage = (await pdf.getPageIndex(ann.dest[0])) + 1;
          if (typeof ann.dest[2] === "number") destX = ann.dest[2];
          if (typeof ann.dest[3] === "number") destY = ann.dest[3];
        } catch {
          /* ignore */
        }
      }
      if (destName || destPage != null) {
        links.push({
          pageNumber: i,
          bbox,
          kind: "dest",
          url: null,
          destName,
          destPage,
          destX,
          destY,
        });
      }
    }
  }

  return {
    title: metaTitle || largestFontText || null,
    pageCount,
    pages,
    formulas,
    links,
  };
}
