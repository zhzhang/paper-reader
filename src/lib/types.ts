export interface ReferenceItem {
  id: string;
  bibKey: string;
  rawText: string;
  title: string | null;
  resolvedArxivId: string | null;
  resolvedUrl: string | null;
  abstract: string | null;
  status: string;
}

export interface PaperFull {
  id: string;
  arxivId: string;
  version: string | null;
  title: string;
  authors: string | null;
  abstract: string | null;
  numPages: number;
  sourceUrl: string;
  references: ReferenceItem[];
}

export interface ResolvedReference extends ReferenceItem {
  arxivPaperId?: string;
}

export type PanelKind =
  | "citation"
  | "page"
  | "section"
  | "figure"
  | "equation"
  | "table"
  | "footnote"
  | "internal";

export interface SidePanel {
  /** Unique panel instance id. */
  key: string;
  kind: PanelKind;
  title: string;
  /** For citation panels: the bibKey to resolve. */
  bibKey?: string;
  /** For section-like panels: cloned subtree HTML. */
  html?: string;
}
