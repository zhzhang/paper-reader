"use client";

import { useEffect, useRef, useState } from "react";
import { KatexMath, RichMath } from "@/components/Katex";

export interface TermState {
  x: number;
  y: number;
  termTex: string;
  formulaTex: string;
  contextText: string;
  paperId: string;
}

interface Props {
  state: TermState;
  onClose: () => void;
}

interface Result {
  definition: string;
  source: string;
}

export function TermPopover({ state, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setError(null);
    setNeedsKey(false);

    fetch("/api/terms/define", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperId: state.paperId,
        formulaTex: state.formulaTex,
        termTex: state.termTex,
        contextText: state.contextText,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 428 || data.needsKey) setNeedsKey(true);
          setError(data.error || "Failed to define term.");
          return;
        }
        setResult({ definition: data.definition, source: data.source });
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Network error.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [state.paperId, state.formulaTex, state.termTex, state.contextText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Defer so the opening mouseup doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  const width = 320;
  const left = Math.max(8, Math.min(state.x - width / 2, window.innerWidth - width - 8));
  const top = Math.min(state.y + 8, window.innerHeight - 160);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left, top, width }}
      className="z-50 rounded-lg border border-neutral-300 bg-white shadow-xl text-sm text-neutral-800"
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <span className="truncate text-base text-neutral-800">
          <KatexMath tex={state.termTex} />
        </span>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="px-3 py-2.5">
        {loading && <p className="text-neutral-500">Looking up term…</p>}
        {!loading && result && (
          <>
            <p className="leading-snug">
              <RichMath text={result.definition} />
            </p>
            <span
              className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                result.source === "paper"
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {result.source === "paper" ? "from paper" : "from model"}
            </span>
          </>
        )}
        {!loading && error && (
          <div className="text-red-600">
            <p>{error}</p>
            {needsKey && (
              <p className="mt-1 text-neutral-500">
                Add your Claude API key from the home screen to enable
                definitions.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
