"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Reference } from "@/db/schema";
import type { PaperDetail } from "@/lib/types";
import { clientRectToBBox, pdfYToFraction } from "@/lib/geometry";
import { useReaderStore } from "@/lib/store";
import { PageOverlay } from "./PageOverlay";
import { SelectionToolbar } from "./SelectionToolbar";
import { LinkPeekCanvas } from "./LinkPeekCanvas";
import { ReferencePopover } from "./ReferencePopover";

export function PdfViewer({
  paper,
  onCreateNote,
}: {
  paper: PaperDetail;
  onCreateNote: (payload: {
    pageNumber: number;
    quote: string;
    rects: { x: number; y: number; w: number; h: number }[];
  }) => void;
}) {
  const fileUrl = `/api/papers/${paper.id}/pdf`;
  const containerRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(
    () => new Set([1, 2, 3]),
  );
  const [hoveredCite, setHoveredCite] = useState<{
    reference: Reference;
    el: HTMLElement;
  } | null>(null);
  const citeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoring = useRef(false);

  const findReference = useCallback(
    (destName: string | null, label?: string | null): Reference | null => {
      if (destName?.startsWith("cite.")) {
        return (
          paper.references.find((r) => r.destName === destName) ||
          paper.references.find((r) =>
            destName.toLowerCase().includes(r.label.toLowerCase()),
          ) ||
          null
        );
      }
      if (label) {
        return (
          paper.references.find(
            (r) => r.label === label || r.ordinal === Number(label),
          ) || null
        );
      }
      return null;
    },
    [paper.references],
  );

  const onCiteEnter = useCallback((reference: Reference, el: HTMLElement) => {
    if (citeHoverTimer.current) clearTimeout(citeHoverTimer.current);
    citeHoverTimer.current = setTimeout(() => {
      setHoveredCite({ reference, el });
    }, 140);
  }, []);

  const onCiteLeave = useCallback(() => {
    if (citeHoverTimer.current) clearTimeout(citeHoverTimer.current);
  }, []);

  const scale = useReaderStore((s) => s.scale);
  const setScale = useReaderStore((s) => s.setScale);
  const setAnchor = useReaderStore((s) => s.setAnchor);
  const anchor = useReaderStore((s) => s.anchor);
  const scrollRequest = useReaderStore((s) => s.scrollRequest);
  const setSelection = useReaderStore((s) => s.setSelection);
  const setQuoteForChat = useReaderStore((s) => s.setQuoteForChat);
  const setDrawer = useReaderStore((s) => s.setDrawer);
  const setPeek = useReaderStore((s) => s.setPeek);
  const pushBack = useReaderStore((s) => s.pushBack);
  const popBack = useReaderStore((s) => s.popBack);
  const backStack = useReaderStore((s) => s.backStack);
  const requestScroll = useReaderStore((s) => s.requestScroll);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("pdfjs-dist");
        mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await mod.getDocument({ url: fileUrl }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    if (scale != null || !containerRef.current || !paper.pages[0]) return;
    const width = containerRef.current.clientWidth - 48;
    const pageW = paper.pages[0].width || 612;
    setScale(Math.min(1.4, Math.max(0.6, width / pageW)));
  }, [scale, paper.pages, setScale]);

  const computeAnchor = useCallback((): {
    pageNumber: number;
    yFraction: number;
  } => {
    const root = containerRef.current;
    if (!root) return { pageNumber: 1, yFraction: 0 };
    const top = root.scrollTop;
    let pageNumber = 1;
    let yFraction = 0;
    for (const [n, el] of pageEls.current) {
      const offset = el.offsetTop;
      const height = el.offsetHeight;
      if (top >= offset && top < offset + height) {
        pageNumber = n;
        yFraction = height ? (top - offset) / height : 0;
        break;
      }
      if (top >= offset + height) pageNumber = n;
    }
    return { pageNumber, yFraction };
  }, []);

  const restoreAnchor = useCallback(
    (a: { pageNumber: number; yFraction: number }) => {
      const root = containerRef.current;
      const el = pageEls.current.get(a.pageNumber);
      if (!root || !el) return;
      restoring.current = true;
      root.scrollTop = el.offsetTop + a.yFraction * el.offsetHeight;
      requestAnimationFrame(() => {
        restoring.current = false;
      });
    },
    [],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onScroll = () => {
      if (restoring.current) return;
      setAnchor(computeAnchor());
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [computeAnchor, setAnchor]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let lastWidth = root.clientWidth;
    const ro = new ResizeObserver(() => {
      if (root.clientWidth === lastWidth) return;
      lastWidth = root.clientWidth;
      const a = useReaderStore.getState().anchor;
      requestAnimationFrame(() => restoreAnchor(a));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [restoreAnchor]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !pdf) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.pageNumber);
            if (!n) continue;
            if (e.isIntersecting) {
              next.add(n);
              next.add(n - 1);
              next.add(n + 1);
              next.add(n + 2);
            }
          }
          return next;
        });
      },
      { root, rootMargin: "600px 0px" },
    );
    for (const el of pageEls.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [pdf, scale]);

  useEffect(() => {
    if (!scrollRequest) return;
    restoreAnchor({
      pageNumber: scrollRequest.pageNumber,
      yFraction: scrollRequest.yFraction,
    });
  }, [scrollRequest, restoreAnchor]);

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelection(null);
        return;
      }
      const quote = sel.toString().trim();
      if (!quote) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      const pageEl = node?.closest("[data-page-number]") as HTMLElement | null;
      if (!pageEl || !containerRef.current?.contains(pageEl)) {
        setSelection(null);
        return;
      }
      const pageNumber = Number(pageEl.dataset.pageNumber);
      const clientRects = [...range.getClientRects()];
      if (!clientRects.length) {
        setSelection(null);
        return;
      }
      const rects = clientRects.map((r) => clientRectToBBox(r, pageEl));
      const last = clientRects[clientRects.length - 1];
      setSelection({
        pageNumber,
        quote,
        rects,
        clientRect: last,
      });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [setSelection]);

  const handleLink = useCallback(
    (
      destName: string | null,
      pageNumber: number | null,
      url: string | null,
      clickRect: DOMRect,
    ) => {
      if (url) {
        setDrawer({ kind: "url", url });
        return;
      }
      if (destName?.startsWith("cite.")) {
        const ref =
          paper.references.find((r) => r.destName === destName) ||
          paper.references.find((r) =>
            destName.toLowerCase().includes(r.label.toLowerCase()),
          );
        if (ref) {
          setDrawer({ kind: "reference", referenceId: ref.id });
          return;
        }
      }
      if (
        destName &&
        /^(figure|equation|table|section)\./i.test(destName) &&
        pageNumber
      ) {
        const link = paper.links.find((l) => l.destName === destName);
        const pageMeta = paper.pages.find((p) => p.pageNumber === pageNumber);
        const yFraction = pdfYToFraction(link?.destY, pageMeta?.height ?? 792);
        setPeek({
          pageNumber,
          yFraction,
          label: destName,
          anchorRect: clickRect,
        });
        return;
      }
      if (pageNumber) {
        pushBack(anchor);
        const link = destName
          ? paper.links.find((l) => l.destName === destName)
          : null;
        const pageMeta = paper.pages.find((p) => p.pageNumber === pageNumber);
        const yFraction = pdfYToFraction(link?.destY, pageMeta?.height ?? 792);
        requestScroll(pageNumber, yFraction);
      }
    },
    [
      paper.references,
      paper.links,
      paper.pages,
      setDrawer,
      setPeek,
      pushBack,
      anchor,
      requestScroll,
    ],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const text = (t.textContent || "").trim();
      const m = text.match(/^\[(\d+)\]$/) || text.match(/^(\d+)$/);
      if (!m) return;
      const label = m[1];
      const ref = paper.references.find(
        (r) => r.label === label || r.ordinal === Number(label),
      );
      if (ref) {
        e.preventDefault();
        setDrawer({ kind: "reference", referenceId: ref.id });
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [paper.references, setDrawer]);

  const pages = paper.pages.length
    ? paper.pages
    : Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => ({
        pageNumber: i + 1,
        width: 612,
        height: 792,
      }));

  const currentScale = scale ?? 1;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-paper-2">
      <div className="flex items-center gap-2 border-b border-rule bg-paper px-3 py-1.5">
        <button
          type="button"
          disabled={!backStack.length}
          onClick={() => {
            const prev = popBack();
            if (prev) restoreAnchor(prev);
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink disabled:opacity-30 hover:bg-paper-2"
        >
          <ChevronLeft className="size-3.5" />
          Back
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-paper-2"
            onClick={() => setScale(Math.max(0.5, currentScale - 0.1))}
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-ink-muted">
            {Math.round(currentScale * 100)}%
          </span>
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-paper-2"
            onClick={() => setScale(Math.min(2.5, currentScale + 0.1))}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="text-sm text-red-700">Failed to load PDF: {error}</div>
        )}
        {!pdf && !error && (
          <div className="text-sm text-ink-muted">Loading PDF…</div>
        )}
        <div className="mx-auto flex w-fit flex-col gap-4">
          {pages.map((p) => {
            const render =
              visiblePages.has(p.pageNumber) ||
              Math.abs(p.pageNumber - anchor.pageNumber) <= 2;
            const pageFormulas = paper.formulas.filter(
              (f) => f.pageNumber === p.pageNumber,
            );
            const pageNotes = paper.notes.filter(
              (n) => n.pageNumber === p.pageNumber,
            );
            const pageLinks = paper.links.filter(
              (l) => l.pageNumber === p.pageNumber,
            );
            const displayWidth = p.width * currentScale;
            const displayHeight = p.height * currentScale;
            return (
              <div
                key={p.pageNumber}
                data-page-number={p.pageNumber}
                ref={(el) => {
                  if (el) pageEls.current.set(p.pageNumber, el);
                  else pageEls.current.delete(p.pageNumber);
                }}
                className="relative bg-white shadow-sm ring-1 ring-rule"
                style={{ width: displayWidth, height: displayHeight }}
              >
                {render && pdf ? (
                  <PdfPage
                    pdf={pdf}
                    pageNumber={p.pageNumber}
                    width={displayWidth}
                    height={displayHeight}
                    scale={currentScale}
                    links={pageLinks}
                    findReference={findReference}
                    onCiteEnter={onCiteEnter}
                    onCiteLeave={onCiteLeave}
                    onLink={handleLink}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center text-xs text-ink-muted"
                    style={{ width: displayWidth, height: displayHeight }}
                  >
                    Page {p.pageNumber}
                  </div>
                )}
                <PageOverlay
                  paperId={paper.id}
                  pageNumber={p.pageNumber}
                  formulas={pageFormulas}
                  notes={pageNotes}
                  glossary={paper.glossary}
                />
              </div>
            );
          })}
        </div>
        {pdf && <LinkPeekCanvas pdf={pdf} />}
        {hoveredCite && (
          <ReferencePopover
            reference={hoveredCite.reference}
            anchorEl={hoveredCite.el}
            onClose={() => setHoveredCite(null)}
          />
        )}
      </div>

      <SelectionToolbar
        onAsk={() => {
          const sel = useReaderStore.getState().selection;
          if (!sel) return;
          setQuoteForChat({ quote: sel.quote, pageNumber: sel.pageNumber });
          window.getSelection()?.removeAllRanges();
          setSelection(null);
        }}
        onNote={() => {
          const sel = useReaderStore.getState().selection;
          if (!sel) return;
          onCreateNote({
            pageNumber: sel.pageNumber,
            quote: sel.quote,
            rects: sel.rects,
          });
          window.getSelection()?.removeAllRanges();
          setSelection(null);
        }}
      />
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  width,
  height,
  scale,
  links,
  findReference,
  onCiteEnter,
  onCiteLeave,
  onLink,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  links: PaperDetail["links"];
  findReference: (destName: string | null, label?: string | null) => Reference | null;
  onCiteEnter: (reference: Reference, el: HTMLElement) => void;
  onCiteLeave: () => void;
  onLink: (
    destName: string | null,
    pageNumber: number | null,
    url: string | null,
    clickRect: DOMRect,
  ) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textLayer = textRef.current;
      if (!canvas || !textLayer) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      if (cancelled) return;

      const textContent = await page.getTextContent();
      textLayer.innerHTML = "";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      // Scale text layer to match CSS size if device pixel differs
      textLayer.style.setProperty("--scale-factor", String(scale));

      for (const item of textContent.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
      }>) {
        if (!item.str) continue;
        const tx = item.transform;
        const span = document.createElement("span");
        span.textContent = item.str;
        const left = tx[4];
        const top = viewport.height - tx[5] - (item.height || 0);
        const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12;
        span.style.left = `${left}px`;
        span.style.top = `${top}px`;
        span.style.fontSize = `${fontHeight}px`;
        span.style.fontFamily = "sans-serif";
        span.style.transformOrigin = "0% 0%";
        textLayer.appendChild(span);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, width, height]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div
        ref={textRef}
        className="absolute inset-0 overflow-hidden leading-none [&_span]:absolute [&_span]:whitespace-pre [&_span]:text-transparent [&_span]:caret-ink"
        style={{ width, height }}
      />
      {links.map((link) => {
        const isCite = Boolean(link.destName?.startsWith("cite."));
        const citeRef = isCite ? findReference(link.destName) : null;
        return (
          <button
            key={link.id}
            type="button"
            className={`absolute z-20 cursor-pointer bg-accent/0 hover:bg-accent/10 ${
              isCite ? "hover:bg-accent/15" : ""
            }`}
            style={{
              left: `${link.bbox.x * 100}%`,
              top: `${link.bbox.y * 100}%`,
              width: `${Math.max(link.bbox.w * 100, 0.5)}%`,
              height: `${Math.max(link.bbox.h * 100, 0.8)}%`,
            }}
            title={isCite ? undefined : link.destName || link.url || "Link"}
            onMouseEnter={(e) => {
              if (citeRef) onCiteEnter(citeRef, e.currentTarget);
            }}
            onMouseLeave={() => {
              if (citeRef) onCiteLeave();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.shiftKey && link.url) {
                window.open(link.url, "_blank");
                return;
              }
              onLink(
                link.destName,
                link.destPage,
                link.url,
                (e.target as HTMLElement).getBoundingClientRect(),
              );
            }}
          />
        );
      })}
    </>
  );
}
