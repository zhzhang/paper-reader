"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { FileUp, Link2, Loader2 } from "lucide-react";

type PaperRow = {
  id: string;
  title: string;
  authors: string[];
  source: string;
  arxivId: string | null;
  pageCount: number;
  status: string;
  error: string | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Library() {
  const router = useRouter();
  const { data: papers, mutate, isLoading } = useSWR<PaperRow[]>(
    "/api/papers",
    fetcher,
    {
      refreshInterval: (d) =>
        d?.some((p) => p.status === "extracting" || p.status === "analyzing")
          ? 1500
          : 0,
    },
  );
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ingestFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/papers", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        await mutate();
        router.push(`/read/${data.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [mutate, router],
  );

  const ingestUrl = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      await mutate();
      router.push(`/read/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [url, mutate, router]);

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <p className="mb-2 font-serif text-sm tracking-wide text-accent">
            Paper Reader
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink md:text-5xl">
            Read with context
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">
            Open any PDF — upload, paste an arXiv link, or a URL. Ask Claude about
            what you highlight, hover formulas for definitions, and keep your place
            when you chase a reference.
          </p>
        </header>

        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void ingestFile(file);
          }}
          className={`mb-6 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
            dragOver
              ? "border-accent bg-accent/5"
              : "border-rule bg-paper-2/50"
          }`}
        >
          <FileUp className="mx-auto mb-3 size-8 text-ink-muted" />
          <p className="text-sm text-ink">Drop a PDF here, or</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="mt-2 text-sm font-medium text-accent hover:underline disabled:opacity-40"
          >
            choose a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void ingestFile(file);
            }}
          />
        </section>

        <form
          className="mb-10 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ingestUrl();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="arXiv id, abs URL, or any PDF URL"
              className="w-full rounded-xl border border-rule bg-paper py-3 pl-10 pr-3 text-sm outline-none focus:border-accent"
              disabled={busy}
            />
          </div>
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-paper disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Open
          </button>
        </form>

        {error && (
          <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Library
          </h2>
          {isLoading && (
            <p className="text-sm text-ink-muted">Loading…</p>
          )}
          {!isLoading && (!papers || papers.length === 0) && (
            <p className="text-sm text-ink-muted">No papers yet.</p>
          )}
          <ul className="divide-y divide-rule border-t border-rule">
            {papers?.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/read/${p.id}`)}
                  className="flex w-full items-start gap-4 py-4 text-left hover:bg-paper-2/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-lg text-ink">{p.title}</div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {p.authors?.slice(0, 3).join(", ")}
                      {p.authors && p.authors.length > 3 ? " et al." : ""}
                      {p.arxivId ? ` · arXiv:${p.arxivId}` : ""}
                      {p.pageCount ? ` · ${p.pageCount}p` : ""}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-800",
    extracting: "bg-amber-50 text-amber-800",
    analyzing: "bg-amber-50 text-amber-800",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${styles[status] ?? "bg-paper-2 text-ink-muted"}`}
    >
      {status}
    </span>
  );
}
