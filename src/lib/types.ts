import type {
  BBox,
  FormulaSpan,
  GlossaryEntry,
  Link,
  Message,
  Note,
  Paper,
  Reference,
} from "@/db/schema";

export type PageMeta = {
  pageNumber: number;
  width: number;
  height: number;
};

export type PaperDetail = Omit<Paper, "filePath"> & {
  pages: PageMeta[];
  formulas: FormulaSpan[];
  links: Link[];
  glossary: GlossaryEntry[];
  references: Reference[];
  notes: Note[];
  messages: Message[];
};

export type SelectionPayload = {
  pageNumber: number;
  quote: string;
  rects: BBox[];
  clientRect: DOMRect;
};

export type ViewerAnchor = {
  pageNumber: number;
  yFraction: number;
};

export type PeekState = {
  pageNumber: number;
  yFraction: number;
  label: string;
  anchorRect: DOMRect;
};

export type DrawerState =
  | { kind: "reference"; referenceId: number }
  | { kind: "url"; url: string; title?: string }
  | null;

export type { BBox };
