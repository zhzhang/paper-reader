"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useState } from "react";
import type { FormulaSpan, GlossaryEntry } from "@/db/schema";
import { Markdown } from "@/components/Markdown";

export function FormulaPopover({
  span,
  glossary,
  paperId,
  anchorEl,
  onClose,
}: {
  span: FormulaSpan;
  glossary: GlossaryEntry[];
  paperId: string;
  anchorEl: HTMLElement;
  onClose: () => void;
}) {
  const matches = glossary.filter((g) => {
    const sym = g.symbolUnicode;
    return (
      span.symbols.includes(sym) ||
      span.text.includes(sym) ||
      (g.symbolLatex && span.text.includes(g.symbolLatex))
    );
  });

  const [explain, setExplain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovering, setHovering] = useState(false);

  const { refs, floatingStyles } = useFloating({
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  useEffect(() => {
    if (!hovering) {
      const t = setTimeout(onClose, 200);
      return () => clearTimeout(t);
    }
  }, [hovering, onClose]);

  async function runExplain() {
    setLoading(true);
    setExplain("");
    try {
      const res = await fetch(`/api/papers/${paperId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formulaText: span.text,
          pageNumber: span.pageNumber,
          context: "",
        }),
      });
      if (!res.ok || !res.body) {
        setExplain("Could not explain (is ANTHROPIC_API_KEY set?).");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string };
          if (ev.type === "text" && ev.text) {
            text += ev.text;
            setExplain(text);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 w-72 rounded-lg border border-rule bg-paper p-3 shadow-xl"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="mb-2 font-mono text-xs text-ink-muted break-all">
        {span.text}
      </div>
      {matches.length > 0 ? (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.id} className="text-sm">
              <div className="font-medium text-ink">
                {m.symbolUnicode}
                {m.name ? ` — ${m.name}` : ""}
              </div>
              <Markdown>{m.definition}</Markdown>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">No glossary entry for this formula.</p>
          <button
            type="button"
            onClick={runExplain}
            disabled={loading}
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper disabled:opacity-50"
          >
            {loading ? "Explaining…" : "Explain"}
          </button>
          {explain != null && <Markdown>{explain}</Markdown>}
        </div>
      )}
    </div>
  );
}
