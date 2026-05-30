import { parseHTML } from "linkedom";

export type LinkKind =
  | "citation"
  | "section"
  | "figure"
  | "equation"
  | "table"
  | "footnote"
  | "internal";

export interface ParsedReference {
  bibKey: string;
  rawText: string;
  title?: string;
  arxivId?: string;
}

export interface ParsedPaper {
  title: string;
  authors: string[];
  abstract: string;
  bodyHtml: string;
  references: ParsedReference[];
}

const ARXIV_IN_TEXT = /arXiv:\s*(\d{4}\.\d{4,5})/i;

function classifyAnchor(href: string): { kind: LinkKind; target: string } | null {
  if (!href.startsWith("#")) return null;
  const target = href.slice(1);
  if (target.startsWith("bib.") || target.startsWith("bib")) {
    if (/^bib\./.test(target)) return { kind: "citation", target };
  }
  if (/footnote/i.test(target)) return { kind: "footnote", target };
  // LaTeXML ids: S3 (section), S3.F2 (figure), S3.E1 (equation), S3.T1 (table)
  if (/\.F\d/i.test(target)) return { kind: "figure", target };
  if (/\.E\d/i.test(target)) return { kind: "equation", target };
  if (/\.T\d/i.test(target)) return { kind: "table", target };
  if (/^S\d|^SS\d|^Sx|^S\d+\.SS/i.test(target)) return { kind: "section", target };
  if (/^bib\.bib/i.test(target)) return { kind: "citation", target };
  return { kind: "internal", target };
}

function makeAbsolute(url: string | null, base: string): string | null {
  if (!url) return url;
  if (/^(https?:|data:|#)/i.test(url)) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export function parsePaper(rawHtml: string, sourceUrl: string): ParsedPaper {
  const { document } = parseHTML(rawHtml);

  // ---- Find the article root -------------------------------------------
  const root =
    document.querySelector("article.ltx_document") ??
    document.querySelector(".ltx_page_main") ??
    document.querySelector("article") ??
    document.body;

  if (!root) {
    throw new Error("Could not locate paper content in the fetched HTML.");
  }

  // ---- Metadata --------------------------------------------------------
  const title =
    text(root.querySelector(".ltx_title.ltx_title_document")) ||
    text(document.querySelector("title")) ||
    "Untitled paper";

  const authors = uniq(
    [...root.querySelectorAll(".ltx_personname")]
      .map((n) => text(n))
      .filter(Boolean),
  );

  const abstract = text(root.querySelector(".ltx_abstract p, .ltx_abstract"));

  // ---- Bibliography ----------------------------------------------------
  const references: ParsedReference[] = [];
  for (const li of root.querySelectorAll("li.ltx_bibitem, .ltx_bibitem")) {
    const bibKey = li.getAttribute("id") || "";
    if (!bibKey) continue;
    const rawText = text(li);
    const blocks = [...li.querySelectorAll(".ltx_bibblock")].map((b) => text(b));
    // Heuristic: authors block, then title block.
    const title =
      blocks.length >= 2 ? blocks[1].replace(/\.$/, "").trim() : undefined;
    const arxivMatch = rawText.match(ARXIV_IN_TEXT);
    references.push({
      bibKey,
      rawText,
      title: title || undefined,
      arxivId: arxivMatch ? arxivMatch[1] : undefined,
    });
  }

  // ---- Classify and annotate links ------------------------------------
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href") || "";
    const info = classifyAnchor(href);
    if (info) {
      a.setAttribute("data-link-kind", info.kind);
      a.setAttribute("data-target", info.target);
    } else if (/^https?:/i.test(href)) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.setAttribute("data-link-kind", "external");
    }
  }

  // ---- Make asset URLs absolute ---------------------------------------
  for (const img of root.querySelectorAll("img")) {
    const abs = makeAbsolute(img.getAttribute("src"), sourceUrl);
    if (abs) img.setAttribute("src", abs);
    img.removeAttribute("srcset");
    img.setAttribute("loading", "lazy");
  }
  for (const source of root.querySelectorAll("source")) {
    const abs = makeAbsolute(source.getAttribute("src"), sourceUrl);
    if (abs) source.setAttribute("src", abs);
  }

  sanitizeInPlace(root);

  const bodyHtml = (root as unknown as { outerHTML: string }).outerHTML;

  return { title, authors, abstract, bodyHtml, references };
}

const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "link",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "noscript",
  "base",
  "meta",
]);

const URL_ATTRS = ["href", "src", "xlink:href"];

/**
 * Lightweight in-place sanitization over the parsed DOM: drop dangerous
 * elements, inline event handlers, and javascript: URLs. The source is the
 * arxiv HTML rendition (reasonably trusted) rendered in a local app.
 */
function sanitizeInPlace(root: Element): void {
  const all = [root, ...root.querySelectorAll("*")] as Element[];
  for (const el of all) {
    const tag = el.tagName?.toLowerCase();
    if (tag && FORBIDDEN_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = (attr.value || "").trim();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.includes(name) && /^(javascript:|data:text\/html)/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

function text(node: Element | null | undefined): string {
  if (!node) return "";
  return (node.textContent || "").replace(/\s+/g, " ").trim();
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}
