"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown prose prose-sm max-w-none text-[13px] leading-relaxed text-ink [&_a]:text-accent [&_code]:rounded [&_code]:bg-paper-2 [&_code]:px-1 [&_p]:my-2 [&_ul]:my-2">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function KatexInline({ latex }: { latex: string }) {
  // Render via markdown for consistency
  const src = latex.startsWith("$") ? latex : `$${latex}$`;
  return <Markdown>{src}</Markdown>;
}
