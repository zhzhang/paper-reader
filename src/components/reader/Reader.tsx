"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArrowLeft, BookOpen, Highlighter, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { PaperDetail } from "@/lib/types";
import { useReaderStore } from "@/lib/store";
import { ChatPanel } from "./ChatPanel";
import { NotesPanel } from "./NotesPanel";
import { GlossaryPanel } from "./GlossaryPanel";
import { ReferenceDrawer } from "./ReferenceDrawer";
import { PdfViewerLoader } from "@/components/viewer/PdfViewerLoader";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Reader({ paperId }: { paperId: string }) {
  const { data: paper, mutate, isLoading } = useSWR<PaperDetail>(
    `/api/papers/${paperId}`,
    fetcher,
    { refreshInterval: (d) => (d && d.status !== "ready" && d.status !== "failed" ? 1500 : 0) },
  );

  const railTab = useReaderStore((s) => s.railTab);
  const setRailTab = useReaderStore((s) => s.setRailTab);
  const drawer = useReaderStore((s) => s.drawer);

  const onCreateNote = useCallback(
    async (payload: {
      pageNumber: number;
      quote: string;
      rects: { x: number; y: number; w: number; h: number }[];
    }) => {
      await fetch(`/api/papers/${paperId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, body: "" }),
      });
      setRailTab("notes");
      await mutate();
    },
    [paperId, mutate, setRailTab],
  );

  if (isLoading || !paper) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-ink-muted">
        Loading paper…
      </div>
    );
  }

  if (paper.status === "failed") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-red-700">Failed to process paper: {paper.error}</p>
        <Link href="/" className="text-sm text-accent hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  if (paper.status !== "ready") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-8">
        <div className="size-8 animate-spin rounded-full border-2 border-rule border-t-accent" />
        <p className="text-sm text-ink">
          {paper.status === "extracting"
            ? "Extracting text, formulas, and links…"
            : "Analyzing symbols and bibliography with Claude…"}
        </p>
        <p className="max-w-md text-center text-xs text-ink-muted">{paper.title}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-rule px-3 py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-paper-2 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Library
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-base font-semibold text-ink">
            {paper.title}
          </h1>
          {paper.authors?.length ? (
            <p className="truncate text-xs text-ink-muted">
              {paper.authors.slice(0, 4).join(", ")}
              {paper.authors.length > 4 ? " et al." : ""}
            </p>
          ) : null}
        </div>
        <span className="text-[11px] tabular-nums text-ink-muted">
          {paper.pageCount} pages
        </span>
      </header>

      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="viewer" minSize="30%" defaultSize={drawer ? "50%" : "70%"}>
          <PdfViewerLoader paper={paper} onCreateNote={onCreateNote} />
        </Panel>

        {drawer && (
          <>
            <Separator className="w-1.5 bg-rule data-[separator=active]:bg-accent" />
            <Panel id="drawer" minSize="20%" defaultSize="28%" collapsible>
              <ReferenceDrawer references={paper.references} />
            </Panel>
          </>
        )}

        <Separator className="w-1.5 bg-rule" />
        <Panel id="rail" minSize="18%" defaultSize="30%" maxSize="45%">
          <div className="flex h-full min-h-0 flex-col border-l border-rule">
            <div className="flex border-b border-rule">
              {(
                [
                  ["ask", MessageSquare, "Ask"],
                  ["notes", Highlighter, "Notes"],
                  ["glossary", BookOpen, "Glossary"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRailTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium ${
                    railTab === id
                      ? "border-b-2 border-accent text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {railTab === "ask" && <ChatPanel paperId={paper.id} />}
              {railTab === "notes" && (
                <NotesPanel notes={paper.notes} onChange={() => void mutate()} />
              )}
              {railTab === "glossary" && (
                <GlossaryPanel entries={paper.glossary} />
              )}
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
