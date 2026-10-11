"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import useSWR from "swr";
import { Markdown } from "@/components/Markdown";
import { useReaderStore } from "@/lib/store";
import type { Message } from "@/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ChatPanel({ paperId }: { paperId: string }) {
  const { data: settings } = useSWR("/api/settings", fetcher);
  const quoteForChat = useReaderStore((s) => s.quoteForChat);
  const setQuoteForChat = useReaderStore((s) => s.setQuoteForChat);
  const requestScroll = useReaderStore((s) => s.requestScroll);

  const [messages, setMessages] = useState<
    Array<{
      role: "user" | "assistant";
      text: string;
      quote?: string | null;
      quotePage?: number | null;
      citations?: Array<{ page?: number; page_location?: { page?: number } }>;
    }>
  >([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch(`/api/papers/${paperId}`)
      .then((r) => r.json())
      .then((paper: { messages: Message[] }) => {
        setMessages(
          (paper.messages ?? []).map((m) => {
            const content = m.content as
              | string
              | { text?: string; citations?: unknown[] };
            const text =
              typeof content === "string" ? content : (content.text ?? "");
            return {
              role: m.role,
              text,
              quote: m.quote,
              quotePage: m.quotePage,
              citations:
                typeof content === "object" && content?.citations
                  ? (content.citations as Array<{
                      page?: number;
                      page_location?: { page?: number };
                    }>)
                  : [],
            };
          }),
        );
      });
  }, [paperId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function send() {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    const quote = quoteForChat?.quote ?? null;
    const quotePage = quoteForChat?.pageNumber ?? null;
    setQuoteForChat(null);

    setMessages((m) => [
      ...m,
      { role: "user", text: question, quote, quotePage },
      { role: "assistant", text: "", citations: [] },
    ]);
    setStreaming(true);

    try {
      const res = await fetch(`/api/papers/${paperId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, quote, quotePage }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Chat failed" }));
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            text: err.error ?? "Chat failed",
          };
          return copy;
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let text = "";
      const citations: Array<{ page?: number; page_location?: { page?: number } }> =
        [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as {
            type: string;
            text?: string;
            citation?: { page?: number; page_location?: { page?: number } };
            error?: string;
          };
          if (ev.type === "text" && ev.text) {
            text += ev.text;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                text,
                citations: [...citations],
              };
              return copy;
            });
          }
          if (ev.type === "citation" && ev.citation) {
            citations.push(ev.citation);
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                text,
                citations: [...citations],
              };
              return copy;
            });
          }
          if (ev.type === "error") {
            text = ev.error ?? "Error";
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", text };
              return copy;
            });
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  if (settings && !settings.hasApiKey) {
    return (
      <div className="p-4 text-sm text-ink-muted">
        Set <code className="rounded bg-paper-2 px-1">ANTHROPIC_API_KEY</code> in{" "}
        <code className="rounded bg-paper-2 px-1">.env.local</code> to ask Claude
        about papers.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-ink-muted">
            Select text in the paper and click Ask, or type a question below.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "rounded-lg bg-paper-2 px-3 py-2 text-sm"
                : "text-sm"
            }
          >
            {m.quote && (
              <blockquote className="mb-1 border-l-2 border-accent pl-2 text-xs text-ink-muted">
                p.{m.quotePage}: “{m.quote}”
              </blockquote>
            )}
            {m.role === "assistant" ? (
              <>
                <Markdown>{m.text || (streaming ? "…" : "")}</Markdown>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.citations.map((c, ci) => {
                      const page =
                        c.page_location?.page ?? c.page ?? null;
                      if (page == null) return null;
                      return (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => requestScroll(page)}
                          className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25"
                        >
                          p.{page}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="whitespace-pre-wrap">{m.text}</p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-rule p-3">
        {quoteForChat && (
          <div className="mb-2 flex items-start gap-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink">
              p.{quoteForChat.pageNumber}: “{quoteForChat.quote}”
            </span>
            <button
              type="button"
              className="text-ink-muted hover:text-ink"
              onClick={() => setQuoteForChat(null)}
            >
              ×
            </button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this paper…"
            className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
            disabled={streaming}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-ink px-3 text-paper disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
