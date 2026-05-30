"use client";

import katex from "katex";
import { useMemo } from "react";

function render(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: "html",
    });
  } catch {
    return escapeHtml(tex);
  }
}

/** Render a single LaTeX string with KaTeX. */
export function KatexMath({
  tex,
  display = false,
}: {
  tex: string;
  display?: boolean;
}) {
  const html = useMemo(() => render(tex, display), [tex, display]);
  return (
    <span
      className={display ? "block" : "inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface Segment {
  type: "text" | "math";
  value: string;
  display: boolean;
}

// Matches $$...$$, \[...\], $...$, \(...\) (display variants first).
const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: text.slice(last, m.index), display: false });
    }
    const display = m[1] !== undefined || m[2] !== undefined;
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    segments.push({ type: "math", value, display });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last), display: false });
  }
  return segments;
}

/** Render text that may contain inline/display LaTeX math delimiters. */
export function RichMath({ text }: { text: string }) {
  const segments = useMemo(() => splitSegments(text), [text]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "math" ? (
          <KatexMath key={i} tex={seg.value} display={seg.display} />
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
