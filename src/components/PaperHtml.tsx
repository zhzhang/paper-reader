"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  findMathAncestor,
  findTermNode,
  getFormulaTex,
  mathmlToTex,
} from "@/lib/mathml";
import type { PanelKind } from "@/lib/types";
import { TermPopover, type TermState } from "@/components/TermPopover";

export interface OpenPanelRequest {
  kind: PanelKind;
  title: string;
  html: string;
  ownerPaperId: string;
}

interface Props {
  html: string;
  /** Id of the paper that owns this HTML (for citation + term lookups). */
  ownerPaperId: string;
  onOpenCitation: (ownerPaperId: string, bibKey: string, label: string) => void;
  onOpenPanel: (req: OpenPanelRequest) => void;
}

export function PaperHtml({
  html,
  ownerPaperId,
  onOpenCitation,
  onOpenPanel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<Element | null>(null);
  const [term, setTerm] = useState<TermState | null>(null);

  const clearHighlight = useCallback(() => {
    if (highlightRef.current) {
      highlightRef.current.classList.remove("term-highlight");
      highlightRef.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    clearHighlight();
    setTerm(null);
  }, [clearHighlight]);

  const cloneTarget = useCallback(
    (targetId: string): string | null => {
      const container = containerRef.current;
      if (!container) return null;
      const el = container.querySelector(`[id="${cssAttr(targetId)}"]`);
      if (!el) return null;
      const clone = el.cloneNode(true) as Element;
      // Strip ids to avoid duplicate-id collisions with the source DOM.
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      return clone.outerHTML;
    },
    [],
  );

  // --- Link interception --------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      const targetEl = e.target as Element;
      const anchor = targetEl.closest?.("a[data-link-kind]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const kind = anchor.getAttribute("data-link-kind") || "";
      if (kind === "external") return; // allow default new-tab navigation

      const target = anchor.getAttribute("data-target") || "";
      if (!target) return;
      e.preventDefault();

      if (kind === "citation") {
        const label = anchor.textContent?.trim() || target;
        onOpenCitation(ownerPaperId, target, label);
        return;
      }

      // section / figure / equation / table / footnote / internal
      const cloned = cloneTarget(target);
      if (cloned) {
        const label =
          anchor.getAttribute("title")?.split("\u2023")[0].trim() ||
          `${capitalize(kind)} ${anchor.textContent?.trim() ?? ""}`.trim();
        onOpenPanel({
          kind: kind as PanelKind,
          title: label,
          html: cloned,
          ownerPaperId,
        });
      }
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [ownerPaperId, onOpenCitation, onOpenPanel, cloneTarget]);

  // --- Formula term selection --------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseUp = (e: MouseEvent) => {
      const targetEl = e.target as Element;
      if (targetEl.closest?.("a[data-link-kind]")) return;

      const mathEl = findMathAncestor(targetEl);
      if (!mathEl) return;

      const selection = window.getSelection();
      const formulaTex = getFormulaTex(mathEl);
      let termTex = "";
      let rect: DOMRect | null = null;
      let node: Element | null = null;

      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (mathEl.contains(range.commonAncestorContainer)) {
          termTex = selection.toString().trim();
          rect = range.getBoundingClientRect();
        }
      }

      if (!termTex) {
        node = findTermNode(targetEl, mathEl);
        if (!node) return;
        termTex = mathmlToTex(node);
        rect = node.getBoundingClientRect();
      }

      if (!termTex || !rect) return;

      clearHighlight();
      if (node) {
        node.classList.add("term-highlight");
        highlightRef.current = node;
      }

      const paragraph = mathEl.closest(".ltx_p, p, li, figcaption, .ltx_caption");
      const contextText = (paragraph?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 700);

      setTerm({
        x: rect.left + rect.width / 2,
        y: rect.bottom,
        termTex,
        formulaTex,
        contextText,
        paperId: ownerPaperId,
      });
    };

    container.addEventListener("mouseup", onMouseUp);
    return () => container.removeEventListener("mouseup", onMouseUp);
  }, [ownerPaperId, clearHighlight]);

  return (
    <>
      <div
        ref={containerRef}
        className="paper-root"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {term && <TermPopover state={term} onClose={closePopover} />}
    </>
  );
}

function cssAttr(id: string): string {
  return id.replace(/"/g, '\\"');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
