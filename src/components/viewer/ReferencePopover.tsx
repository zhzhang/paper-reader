"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Reference } from "@/db/schema";
import { useReaderStore } from "@/lib/store";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function displayTitle(ref: Reference): string {
  const title = ref.title?.trim();
  if (title && !looksLikeBibKey(title)) return title;
  if (ref.rawText?.trim() && !looksLikeBibKey(ref.rawText)) return ref.rawText.trim();
  if (ref.destName) return ref.destName.replace(/^cite\./i, "");
  return title || `Reference [${ref.label}]`;
}

function looksLikeBibKey(s: string): boolean {
  return /^[a-z][a-zA-Z]*\d{4}[a-zA-Z0-9]*$/.test(s.trim());
}

export function ReferencePopover({
  reference,
  anchorEl,
  onClose,
}: {
  reference: Reference;
  anchorEl: HTMLElement;
  onClose: () => void;
}) {
  const setDrawer = useReaderStore((s) => s.setDrawer);
  const [hovering, setHovering] = useState(false);

  const { data: resolved, isLoading } = useSWR<Reference>(
    `/api/references/${reference.id}/resolve`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const ref = resolved ?? reference;

  const { refs, floatingStyles } = useFloating({
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  useEffect(() => {
    if (!hovering) {
      const t = setTimeout(onClose, 220);
      return () => clearTimeout(t);
    }
  }, [hovering, onClose]);

  const authors = (ref.authors ?? []).filter(Boolean);
  const abstract = ref.abstract?.trim() ?? "";

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 w-80 rounded-lg border border-rule bg-paper p-3 shadow-xl"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        [{ref.label}]
        {ref.year ? ` · ${ref.year}` : ""}
      </div>
      <h3 className="text-sm font-semibold leading-snug text-ink">
        {displayTitle(ref)}
      </h3>
      {authors.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted line-clamp-2">
          {authors.slice(0, 6).join(", ")}
          {authors.length > 6 ? " et al." : ""}
        </p>
      )}
      {abstract ? (
        <p className="mt-2 text-xs leading-relaxed text-ink line-clamp-5">
          {abstract}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          {isLoading ? "Looking up citation…" : "No abstract available yet."}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper"
          onClick={() => {
            setDrawer({ kind: "reference", referenceId: ref.id });
            onClose();
          }}
        >
          Open
        </button>
        {(ref.resolvedPdfUrl || ref.url || ref.doi || ref.arxivId) && (
          <a
            href={
              ref.resolvedPdfUrl ||
              ref.url ||
              (ref.doi ? `https://doi.org/${ref.doi}` : null) ||
              (ref.arxivId ? `https://arxiv.org/abs/${ref.arxivId}` : "#")
            }
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            External link
          </a>
        )}
      </div>
    </div>
  );
}
