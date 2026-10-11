"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { useReaderStore } from "@/lib/store";
import type { Note } from "@/db/schema";

export function NotesPanel({
  notes,
  onChange,
}: {
  notes: Note[];
  onChange: () => void;
}) {
  const requestScroll = useReaderStore((s) => s.requestScroll);
  const setFlashNoteId = useReaderStore((s) => s.setFlashNoteId);
  const activeNoteId = useReaderStore((s) => s.activeNoteId);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const sorted = [...notes].sort((a, b) => a.pageNumber - b.pageNumber);

  async function save(id: number) {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    setEditing(null);
    onChange();
  }

  async function remove(id: number) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    onChange();
  }

  if (!sorted.length) {
    return (
      <p className="p-4 text-sm text-ink-muted">
        Select text and click Note to attach a note to a place in the paper.
      </p>
    );
  }

  return (
    <ul className="space-y-2 p-3">
      {sorted.map((n) => (
        <li
          key={n.id}
          className={`rounded-lg border px-3 py-2 ${
            activeNoteId === n.id ? "border-accent bg-accent/5" : "border-rule"
          }`}
        >
          <button
            type="button"
            className="mb-1 text-left text-[11px] font-medium text-accent hover:underline"
            onClick={() => {
              const y = n.rects[0]?.y ?? 0;
              requestScroll(n.pageNumber, y);
              setFlashNoteId(n.id);
              setTimeout(() => setFlashNoteId(null), 1200);
            }}
          >
            Page {n.pageNumber}
          </button>
          {n.quote && (
            <blockquote className="mb-1 border-l-2 border-rule pl-2 text-xs text-ink-muted line-clamp-2">
              {n.quote}
            </blockquote>
          )}
          {editing === n.id ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-rule bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save(n.id)}
                  className="rounded-md bg-ink px-2 py-1 text-xs text-paper"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-xs text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="cursor-text"
              onClick={() => {
                setEditing(n.id);
                setDraft(n.body);
              }}
            >
              {n.body ? (
                <Markdown>{n.body}</Markdown>
              ) : (
                <span className="text-xs text-ink-muted">Click to add note…</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => void remove(n.id)}
            className="mt-1 text-ink-muted hover:text-red-600"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
