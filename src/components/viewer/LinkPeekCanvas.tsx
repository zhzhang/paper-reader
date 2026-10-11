"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useReaderStore } from "@/lib/store";

export function LinkPeekCanvas({ pdf }: { pdf: PDFDocumentProxy }) {
  const peek = useReaderStore((s) => s.peek);
  const setPeek = useReaderStore((s) => s.setPeek);
  const requestScroll = useReaderStore((s) => s.requestScroll);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const virtualEl = useMemo(() => {
    if (!peek) return null;
    const rect = peek.anchorRect;
    return {
      getBoundingClientRect: () => rect,
      contextElement: undefined as Element | undefined,
    };
  }, [peek]);

  const { refs, floatingStyles, update } = useFloating({
    placement: "right-start",
    middleware: [offset(12), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!virtualEl) return;
    refs.setReference(virtualEl);
    void update();
  }, [virtualEl, refs, update]);

  useEffect(() => {
    if (!peek) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(peek.pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 0.45 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch {
        /* ignore peek render errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peek, pdf]);

  if (!peek) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 w-64 overflow-hidden rounded-lg border border-rule bg-paper shadow-xl"
      onMouseLeave={() => setPeek(null)}
    >
      <div className="flex items-center justify-between border-b border-rule px-2 py-1.5">
        <span className="truncate text-xs font-medium text-ink">{peek.label}</span>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => {
            requestScroll(peek.pageNumber, peek.yFraction);
            setPeek(null);
          }}
        >
          Go there
        </button>
      </div>
      <div className="max-h-48 overflow-hidden bg-paper-2">
        <div style={{ transform: `translateY(-${peek.yFraction * 80}%)` }}>
          <canvas ref={canvasRef} className="w-full" />
        </div>
      </div>
    </div>
  );
}
