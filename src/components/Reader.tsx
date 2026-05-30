"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PaperHtml, type OpenPanelRequest } from "@/components/PaperHtml";
import type { PaperFull, ReferenceItem, ResolvedReference } from "@/lib/types";

interface OpenedPanel {
  key: string;
  kind: string;
  title: string;
  // section-like content
  html?: string;
  ownerPaperId: string;
  // citation
  bibKey?: string;
  resolving?: boolean;
  reference?: ResolvedReference;
  error?: string;
  citedHtml?: string;
  citedPaperId?: string;
}

let panelCounter = 0;

export function Reader({ paper }: { paper: PaperFull }) {
  const [panels, setPanels] = useState<OpenedPanel[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // bibKey -> reference, per owning paper.
  const refMaps = useRef<Record<string, Record<string, ReferenceItem>>>({});
  if (!refMaps.current[paper.id]) {
    refMaps.current[paper.id] = Object.fromEntries(
      paper.references.map((r) => [r.bibKey, r]),
    );
  }

  const updatePanel = useCallback((key: string, patch: Partial<OpenedPanel>) => {
    setPanels((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }, []);

  const closePanel = useCallback((key: string) => {
    setPanels((prev) => {
      const next = prev.filter((p) => p.key !== key);
      setActiveKey((cur) => (cur === key ? next[next.length - 1]?.key ?? null : cur));
      return next;
    });
  }, []);

  const openPanel = useCallback((req: OpenPanelRequest) => {
    const key = `p${++panelCounter}`;
    setPanels((prev) => [
      ...prev,
      { key, kind: req.kind, title: req.title, html: req.html, ownerPaperId: req.ownerPaperId },
    ]);
    setActiveKey(key);
  }, []);

  const openCitation = useCallback(
    async (ownerPaperId: string, bibKey: string, label: string) => {
      const reference = refMaps.current[ownerPaperId]?.[bibKey];
      const key = `p${++panelCounter}`;
      setPanels((prev) => [
        ...prev,
        {
          key,
          kind: "citation",
          title: `[${label}]`,
          ownerPaperId,
          bibKey,
          resolving: true,
          error: reference ? undefined : "Reference not found in this paper.",
        },
      ]);
      setActiveKey(key);
      if (!reference) {
        updatePanel(key, { resolving: false });
        return;
      }

      try {
        const res = await fetch(`/api/references/${reference.id}/resolve`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          updatePanel(key, { resolving: false, error: data.error || "Failed to resolve." });
          return;
        }
        const resolved: ResolvedReference = data.reference;
        const patch: Partial<OpenedPanel> = {
          resolving: false,
          reference: resolved,
          title: resolved.title ? truncate(resolved.title, 50) : `[${label}]`,
        };

        if (resolved.arxivPaperId) {
          const pres = await fetch(`/api/papers/${resolved.arxivPaperId}`);
          if (pres.ok) {
            const pdata = await pres.json();
            const cited: PaperFull = pdata.paper;
            refMaps.current[cited.id] = Object.fromEntries(
              cited.references.map((r) => [r.bibKey, r]),
            );
            patch.citedHtml = cited.html;
            patch.citedPaperId = cited.id;
          }
        }
        updatePanel(key, patch);
      } catch (e) {
        updatePanel(key, {
          resolving: false,
          error: e instanceof Error ? e.message : "Network error.",
        });
      }
    },
    [updatePanel],
  );

  const hasPanels = panels.length > 0;
  const activePanel = useMemo(
    () => panels.find((p) => p.key === activeKey) ?? null,
    [panels, activeKey],
  );

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
        <Link href="/" className="text-sm font-semibold text-neutral-700 hover:text-black">
          ← Library
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-neutral-900">{paper.title}</h1>
          <p className="truncate text-xs text-neutral-500">
            arXiv:{paper.arxivId}
            {paper.authors ? ` · ${paper.authors}` : ""}
          </p>
        </div>
        <a
          href={`https://arxiv.org/abs/${paper.arxivId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-blue-600 hover:underline"
        >
          arxiv.org ↗
        </a>
      </header>

      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={hasPanels ? 50 : 100} minSize={25}>
          <div className="h-full overflow-y-auto bg-white">
            <div className="mx-auto max-w-3xl px-6 py-8">
              <PaperHtml
                html={paper.html}
                ownerPaperId={paper.id}
                onOpenCitation={openCitation}
                onOpenPanel={openPanel}
              />
            </div>
          </div>
        </Panel>

        {hasPanels && (
          <Separator className="w-1.5 cursor-col-resize bg-neutral-200 transition-colors hover:bg-blue-400" />
        )}
        {hasPanels && (
            <Panel defaultSize={50} minSize={25}>
              <div className="flex h-full flex-col bg-white">
                <div className="flex items-stretch gap-0 overflow-x-auto border-b border-neutral-200 bg-neutral-50">
                  {panels.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setActiveKey(p.key)}
                      className={`group flex max-w-[180px] shrink-0 items-center gap-1.5 border-r border-neutral-200 px-3 py-2 text-xs ${
                        p.key === activeKey
                          ? "bg-white font-medium text-neutral-900"
                          : "text-neutral-500 hover:bg-white/60"
                      }`}
                      title={p.title}
                    >
                      <span className="text-[10px] uppercase text-neutral-400">
                        {kindBadge(p.kind)}
                      </span>
                      <span className="truncate">{p.title}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          closePanel(p.key);
                        }}
                        className="ml-1 rounded px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activePanel && (
                    <PanelBody
                      panel={activePanel}
                      onOpenCitation={openCitation}
                      onOpenPanel={openPanel}
                    />
                  )}
                </div>
              </div>
            </Panel>
        )}
      </Group>
    </div>
  );
}

function PanelBody({
  panel,
  onOpenCitation,
  onOpenPanel,
}: {
  panel: OpenedPanel;
  onOpenCitation: (ownerPaperId: string, bibKey: string, label: string) => void;
  onOpenPanel: (req: OpenPanelRequest) => void;
}) {
  // Citation panel
  if (panel.kind === "citation") {
    if (panel.resolving) {
      return <div className="p-6 text-sm text-neutral-500">Resolving citation…</div>;
    }
    if (panel.citedHtml && panel.citedPaperId) {
      return (
        <div>
          {panel.reference?.resolvedUrl && (
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs">
              <a
                href={panel.reference.resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open original ↗
              </a>
            </div>
          )}
          <div className="mx-auto max-w-2xl px-5 py-6">
            <PaperHtml
              html={panel.citedHtml}
              ownerPaperId={panel.citedPaperId}
              onOpenCitation={onOpenCitation}
              onOpenPanel={onOpenPanel}
            />
          </div>
        </div>
      );
    }
    // Metadata card
    return (
      <div className="p-5 text-sm">
        {panel.reference?.title && (
          <h2 className="mb-1 text-base font-semibold text-neutral-900">
            {panel.reference.title}
          </h2>
        )}
        <p className="mb-3 text-xs text-neutral-500">{panel.reference?.rawText}</p>
        {panel.reference?.abstract && (
          <p className="mb-3 leading-snug text-neutral-700">
            {panel.reference.abstract}
          </p>
        )}
        {panel.reference?.resolvedUrl ? (
          <a
            href={panel.reference.resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Open paper ↗
          </a>
        ) : (
          <p className="text-neutral-400">
            {panel.error || "Could not find this paper online."}
          </p>
        )}
      </div>
    );
  }

  // Section / figure / equation / table / footnote panel
  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <PaperHtml
        html={panel.html || ""}
        ownerPaperId={panel.ownerPaperId}
        onOpenCitation={onOpenCitation}
        onOpenPanel={onOpenPanel}
      />
    </div>
  );
}

function kindBadge(kind: string): string {
  switch (kind) {
    case "citation":
      return "cite";
    case "figure":
      return "fig";
    case "equation":
      return "eq";
    case "table":
      return "tbl";
    case "footnote":
      return "note";
    case "section":
      return "sec";
    default:
      return "ref";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
