"use client";

import { Markdown } from "@/components/Markdown";
import { useReaderStore } from "@/lib/store";
import type { GlossaryEntry } from "@/db/schema";

export function GlossaryPanel({ entries }: { entries: GlossaryEntry[] }) {
  const requestScroll = useReaderStore((s) => s.requestScroll);

  if (!entries.length) {
    return (
      <p className="p-4 text-sm text-ink-muted">
        No glossary yet. Entries are extracted when a paper finishes analyzing.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {entries.map((e) => (
        <li key={e.id} className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-ink">
              {e.symbolUnicode}
              {e.name ? (
                <span className="font-normal text-ink-muted"> — {e.name}</span>
              ) : null}
            </span>
            {e.firstPage != null && (
              <button
                type="button"
                onClick={() => requestScroll(e.firstPage!)}
                className="shrink-0 text-[11px] text-accent hover:underline"
              >
                p.{e.firstPage}
              </button>
            )}
          </div>
          {e.symbolLatex && (
            <div className="text-xs text-ink-muted">
              <Markdown>{`$${e.symbolLatex}$`}</Markdown>
            </div>
          )}
          <Markdown>{e.definition}</Markdown>
        </li>
      ))}
    </ul>
  );
}
