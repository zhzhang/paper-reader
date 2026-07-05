"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OnItemClickArgs } from "react-pdf/dist/shared/types.js";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { TermPopover, type TermState } from "@/components/TermPopover";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface OpenPagePanelRequest {
  ownerPaperId: string;
  fileUrl: string;
  dest: string | unknown[];
  pageNumber: number;
  destY?: number;
  kindLabel: string;
}

interface PdfViewerProps {
  fileUrl: string;
  ownerPaperId: string;
  numPages: number;
  onOpenCitation: (ownerPaperId: string, bibKey: string, label: string) => void;
  onOpenPagePanel: (req: OpenPagePanelRequest) => void;
  singlePage?: { pageNumber: number; destY?: number };
}

function classifyDest(dest: string | unknown[]): string {
  if (typeof dest !== "string") return "ref";
  const lower = dest.toLowerCase();
  if (lower.startsWith("section") || lower.startsWith("subsection")) return "sec";
  if (lower.startsWith("figure")) return "fig";
  if (lower.startsWith("equation")) return "eq";
  if (lower.startsWith("table")) return "tbl";
  if (lower.includes("footnote")) return "note";
  return "ref";
}

export function PdfViewer({
  fileUrl,
  ownerPaperId,
  numPages,
  onOpenCitation,
  onOpenPagePanel,
  singlePage,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [term, setTerm] = useState<TermState | null>(null);

  const file = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    setContainerWidth(Math.floor(el.clientWidth));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      let anchor: Node | null = range.commonAncestorContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentElement;
      const textLayer = (anchor as Element | null)?.closest?.(
        ".react-pdf__Page__textContent",
      );
      if (!textLayer || !container.contains(textLayer)) return;

      const selected = selection.toString().trim();
      if (!selected || selected.length > 200) return;

      const pageText = (textLayer.textContent || "").replace(/\s+/g, " ").trim();
      const contextText = pageText.slice(0, 700);

      const rect = range.getBoundingClientRect();
      setTerm({
        x: rect.left + rect.width / 2,
        y: rect.bottom,
        termTex: selected,
        formulaTex: selected,
        contextText,
        paperId: ownerPaperId,
      });
    };

    container.addEventListener("mouseup", onMouseUp);
    return () => container.removeEventListener("mouseup", onMouseUp);
  }, [ownerPaperId]);

  const handleItemClick = useCallback(
    async ({ dest, pageNumber }: OnItemClickArgs) => {
      if (!dest || !pageNumber) return;

      let resolvedDest: string | unknown[] | null = null;
      if (typeof dest === "string") {
        resolvedDest = dest;
      } else if (dest instanceof Promise) {
        resolvedDest = await dest;
      } else if (Array.isArray(dest)) {
        resolvedDest = dest;
      }

      if (typeof resolvedDest === "string" && resolvedDest.startsWith("cite.")) {
        onOpenCitation(
          ownerPaperId,
          resolvedDest,
          resolvedDest.replace(/^cite\./, ""),
        );
        return;
      }

      let explicit: unknown[] | null = null;
      if (typeof resolvedDest === "string" && pdfRef.current) {
        try {
          explicit = (await pdfRef.current.getDestination(resolvedDest)) as
            | unknown[]
            | null;
        } catch {
          explicit = null;
        }
      } else if (Array.isArray(resolvedDest)) {
        explicit = resolvedDest;
      }

      const destY =
        explicit && typeof explicit[3] === "number" ? explicit[3] : undefined;

      const destForPanel =
        resolvedDest ??
        (typeof dest === "string" || Array.isArray(dest) ? dest : []);

      onOpenPagePanel({
        ownerPaperId,
        fileUrl,
        dest: destForPanel,
        pageNumber,
        destY,
        kindLabel: classifyDest(destForPanel),
      });
    },
    [ownerPaperId, fileUrl, onOpenCitation, onOpenPagePanel],
  );

  const handlePageRenderSuccess = useCallback(
    async (pageProxy: { getViewport: (p: { scale: number }) => { width: number; height: number } }) => {
      if (!singlePage?.destY || !scrollRef.current || !containerWidth) return;
      const viewport = pageProxy.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scrollTop = (viewport.height - singlePage.destY) * scale;
      scrollRef.current.scrollTop = Math.max(0, scrollTop - 40);
    },
    [singlePage?.destY, containerWidth],
  );

  const pagesToRender = singlePage
    ? [singlePage.pageNumber]
    : Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div ref={containerRef} className="h-full w-full">
      <div
        ref={scrollRef}
        className={singlePage ? "h-full overflow-y-auto" : undefined}
      >
        {containerWidth > 0 && (
          <Document
            file={file}
            onLoadSuccess={(pdf) => {
              pdfRef.current = pdf;
            }}
            onItemClick={handleItemClick}
            externalLinkTarget="_blank"
          >
            {pagesToRender.map((pageNumber) => (
              <Page
                key={pageNumber}
                pageNumber={pageNumber}
                width={containerWidth}
                renderTextLayer
                renderAnnotationLayer
                onRenderSuccess={
                  singlePage ? handlePageRenderSuccess : undefined
                }
              />
            ))}
          </Document>
        )}
      </div>
      {term && <TermPopover state={term} onClose={() => setTerm(null)} />}
    </div>
  );
}
