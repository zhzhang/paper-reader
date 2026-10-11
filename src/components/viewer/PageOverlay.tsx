"use client";

import { useRef, useState } from "react";
import type { FormulaSpan, GlossaryEntry, Note } from "@/db/schema";
import { FormulaPopover } from "./FormulaPopover";
import { useReaderStore } from "@/lib/store";

export function PageOverlay({
  paperId,
  pageNumber,
  formulas,
  notes,
  glossary,
}: {
  paperId: string;
  pageNumber: number;
  formulas: FormulaSpan[];
  notes: Note[];
  glossary: GlossaryEntry[];
}) {
  const flashNoteId = useReaderStore((s) => s.flashNoteId);
  const setActiveNoteId = useReaderStore((s) => s.setActiveNoteId);
  const [hovered, setHovered] = useState<{
    span: FormulaSpan;
    el: HTMLElement;
  } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {notes.map((note) =>
        note.rects.map((r, i) => (
          <button
            key={`${note.id}-${i}`}
            type="button"
            className={`pointer-events-auto absolute border-0 p-0 ${
              flashNoteId === note.id
                ? "bg-accent/35 animate-pulse"
                : "bg-accent/20 hover:bg-accent/30"
            }`}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${Math.max(r.w * 100, 0.5)}%`,
              height: `${Math.max(r.h * 100, 0.8)}%`,
            }}
            title={note.body.slice(0, 80) || note.quote}
            onClick={() => setActiveNoteId(note.id)}
          />
        )),
      )}

      {formulas.map((span) => (
        <div
          key={span.id}
          className="pointer-events-auto absolute cursor-help border-b border-transparent hover:border-accent/60"
          style={{
            left: `${span.bbox.x * 100}%`,
            top: `${span.bbox.y * 100}%`,
            width: `${Math.max(span.bbox.w * 100, 0.5)}%`,
            height: `${Math.max(span.bbox.h * 100, 0.8)}%`,
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => {
              setHovered({ span, el });
            }, 120);
          }}
          onMouseLeave={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
          }}
        />
      ))}

      {hovered && (
        <FormulaPopover
          span={hovered.span}
          glossary={glossary}
          paperId={paperId}
          anchorEl={hovered.el}
          onClose={() => setHovered(null)}
        />
      )}

      {/* silence unused pageNumber if only used for filtering upstream */}
      <span className="hidden" data-page={pageNumber} />
    </div>
  );
}
