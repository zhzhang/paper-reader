"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiKeyModal } from "@/components/ApiKeyModal";

interface RecentPaper {
  id: string;
  arxivId: string;
  title: string;
  authors: string | null;
  createdAt: string;
}

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentPaper[]>([]);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);

  const loadStatus = () => {
    fetch("/api/settings/api-key")
      .then((r) => r.json())
      .then((d) => {
        setKeyConfigured(Boolean(d.configured));
        setModel(d.model || "");
      })
      .catch(() => setKeyConfigured(false));
  };

  useEffect(() => {
    loadStatus();
    fetch("/api/papers")
      .then((r) => r.json())
      .then((d) => setRecent(d.papers || []))
      .catch(() => {});
  }, []);

  const open = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to open paper.");
        return;
      }
      router.push(`/read/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Paper Reader
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              keyConfigured ? "bg-green-500" : "bg-amber-500"
            }`}
          />
          {keyConfigured ? "API key set" : "Add API key"}
        </button>
      </div>

      <p className="mt-2 text-sm text-neutral-500">
        Read arxiv papers without losing your place. Citations, sections, and
        equations open in parallel; click formula terms for definitions.
      </p>

      <form onSubmit={open} className="mt-8">
        <div className="flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="arxiv link or id, e.g. 1706.03762 or arxiv.org/abs/2310.06825"
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Open"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {loading && (
          <p className="mt-2 text-xs text-neutral-400">
            Fetching and parsing the HTML version… first load can take a few
            seconds.
          </p>
        )}
      </form>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Recent
          </h2>
          <ul className="divide-y divide-neutral-100">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => router.push(`/read/${p.id}`)}
                  className="block w-full py-3 text-left hover:bg-neutral-50"
                >
                  <p className="text-sm font-medium text-neutral-900">{p.title}</p>
                  <p className="truncate text-xs text-neutral-500">
                    arXiv:{p.arxivId}
                    {p.authors ? ` · ${p.authors}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ApiKeyModal
        open={modalOpen}
        currentModel={model}
        onClose={() => setModalOpen(false)}
        onSaved={loadStatus}
      />
    </main>
  );
}
