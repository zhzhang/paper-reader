"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { Highlighter, MessageSquare } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useReaderStore } from "@/lib/store";

export function SelectionToolbar({
  onAsk,
  onNote,
}: {
  onAsk: () => void;
  onNote: () => void;
}) {
  const selection = useReaderStore((s) => s.selection);

  const virtualEl = useMemo(() => {
    if (!selection) return null;
    const rect = selection.clientRect;
    return {
      getBoundingClientRect: () => rect,
    };
  }, [selection]);

  const { refs, floatingStyles, update } = useFloating({
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!virtualEl) return;
    refs.setReference(virtualEl);
    void update();
  }, [virtualEl, refs, update]);

  if (!selection) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 flex items-center gap-1 rounded-lg border border-rule bg-paper px-1 py-1 shadow-lg"
    >
      <button
        type="button"
        onClick={onAsk}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper-2"
      >
        <MessageSquare className="size-3.5" />
        Ask
      </button>
      <button
        type="button"
        onClick={onNote}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper-2"
      >
        <Highlighter className="size-3.5" />
        Note
      </button>
    </div>
  );
}
