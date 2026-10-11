"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import useSWR from "swr";
import { useReaderStore } from "@/lib/store";
import type { Reference } from "@/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function RefPdfPreview({ fileUrl }: { fileUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        const root = containerRef.current;
        if (!root) return;
        root.innerHTML = "";
        const max = Math.min(doc.numPages, 20);
        for (let i = 1; i <= max; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 0.7 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mb-2 w-full";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          root.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return (
    <div>
      {loading && (
        <p className="p-4 text-xs text-ink-muted">Loading referenced PDF…</p>
      )}
      {error && (
        <p className="p-4 text-xs text-ink-muted">
          Could not load PDF here. Use Open instead.
        </p>
      )}
      <div ref={containerRef} />
    </div>
  );
}

export function ReferenceDrawer({
  references,
}: {
  references: Reference[];
}) {
  const drawer = useReaderStore((s) => s.drawer);
  const setDrawer = useReaderStore((s) => s.setDrawer);
  const [adding, setAdding] = useState(false);

  const ref =
    drawer?.kind === "reference"
      ? references.find((r) => r.id === drawer.referenceId)
      : null;

  const resolveKey =
    drawer?.kind === "reference"
      ? `/api/references/${drawer.referenceId}/resolve`
      : null;
  const { data: resolved } = useSWR<Reference>(resolveKey, fetcher, {
    revalidateOnFocus: false,
  });

  const display = resolved ?? ref;

  if (!drawer) return null;

  const title =
    drawer.kind === "url"
      ? drawer.title || drawer.url
      : display?.title || display?.rawText || `Reference ${display?.label}`;

  const pdfUrl =
    drawer.kind === "url"
      ? `/api/proxy-pdf?url=${encodeURIComponent(drawer.url)}`
      : display?.resolvedPdfUrl
        ? `/api/proxy-pdf?url=${encodeURIComponent(display.resolvedPdfUrl)}`
        : null;

  const openUrl =
    drawer.kind === "url"
      ? drawer.url
      : display?.resolvedPdfUrl || display?.url || null;

  async function addToLibrary() {
    const url =
      drawer?.kind === "url"
        ? drawer.url
        : display?.resolvedPdfUrl || display?.url;
    if (!url) return;
    setAdding(true);
    try {
      await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-rule bg-paper">
      <div className="flex items-start gap-2 border-b border-rule px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {drawer.kind === "reference" ? `[${display?.label}]` : "Link"}
          </div>
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {display?.authors?.length ? (
            <p className="truncate text-xs text-ink-muted">
              {display.authors.join(", ")}
              {display.year ? ` · ${display.year}` : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setDrawer(null)}
          className="rounded-md p-1 hover:bg-paper-2"
        >
          <X className="size-4" />
        </button>
      </div>

      {display?.abstract && (
        <div className="max-h-32 overflow-auto border-b border-rule px-3 py-2 text-xs leading-relaxed text-ink-muted">
          {display.abstract}
        </div>
      )}

      <div className="flex gap-2 border-b border-rule px-3 py-2">
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs hover:bg-paper-2"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
        )}
        {(display?.resolvedPdfUrl || drawer.kind === "url") && (
          <button
            type="button"
            disabled={adding}
            onClick={() => void addToLibrary()}
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs hover:bg-paper-2 disabled:opacity-40"
          >
            <Plus className="size-3" />
            Add to library
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-paper-2 p-2">
        {pdfUrl ? (
          <RefPdfPreview fileUrl={pdfUrl} />
        ) : (
          <p className="p-4 text-xs text-ink-muted">
            {drawer.kind === "reference"
              ? "Resolving open-access PDF…"
              : "No PDF available for this link."}
          </p>
        )}
      </div>
    </div>
  );
}
