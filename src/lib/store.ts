import { create } from "zustand";
import type {
  DrawerState,
  PeekState,
  SelectionPayload,
  ViewerAnchor,
} from "@/lib/types";

type ReaderStore = {
  scale: number | null;
  setScale: (s: number) => void;
  anchor: ViewerAnchor;
  setAnchor: (a: ViewerAnchor) => void;
  scrollRequest: { pageNumber: number; yFraction: number; token: number } | null;
  requestScroll: (pageNumber: number, yFraction?: number) => void;
  backStack: ViewerAnchor[];
  pushBack: (a: ViewerAnchor) => void;
  popBack: () => ViewerAnchor | null;
  selection: SelectionPayload | null;
  setSelection: (s: SelectionPayload | null) => void;
  quoteForChat: { quote: string; pageNumber: number } | null;
  setQuoteForChat: (q: { quote: string; pageNumber: number } | null) => void;
  railTab: "ask" | "notes" | "glossary";
  setRailTab: (t: "ask" | "notes" | "glossary") => void;
  drawer: DrawerState;
  setDrawer: (d: DrawerState) => void;
  peek: PeekState | null;
  setPeek: (p: PeekState | null) => void;
  flashNoteId: number | null;
  setFlashNoteId: (id: number | null) => void;
  activeNoteId: number | null;
  setActiveNoteId: (id: number | null) => void;
};

export const useReaderStore = create<ReaderStore>((set, get) => ({
  scale: null,
  setScale: (s) => set({ scale: s }),
  anchor: { pageNumber: 1, yFraction: 0 },
  setAnchor: (a) => set({ anchor: a }),
  scrollRequest: null,
  requestScroll: (pageNumber, yFraction = 0) =>
    set({
      scrollRequest: {
        pageNumber,
        yFraction,
        token: Date.now(),
      },
    }),
  backStack: [],
  pushBack: (a) => set({ backStack: [...get().backStack, a] }),
  popBack: () => {
    const stack = get().backStack;
    if (!stack.length) return null;
    const next = stack[stack.length - 1];
    set({ backStack: stack.slice(0, -1) });
    return next;
  },
  selection: null,
  setSelection: (s) => set({ selection: s }),
  quoteForChat: null,
  setQuoteForChat: (q) => set({ quoteForChat: q, railTab: "ask" }),
  railTab: "ask",
  setRailTab: (t) => set({ railTab: t }),
  drawer: null,
  setDrawer: (d) => set({ drawer: d }),
  peek: null,
  setPeek: (p) => set({ peek: p }),
  flashNoteId: null,
  setFlashNoteId: (id) => set({ flashNoteId: id }),
  activeNoteId: null,
  setActiveNoteId: (id) => set({ activeNoteId: id, railTab: "notes" }),
}));
