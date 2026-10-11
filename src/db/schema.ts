import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("Untitled"),
  authors: text("authors", { mode: "json" }).$type<string[]>().notNull().default([]),
  source: text("source", { enum: ["upload", "arxiv", "url"] }).notNull(),
  sourceUrl: text("source_url"),
  arxivId: text("arxiv_id"),
  doi: text("doi"),
  filePath: text("file_path").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  status: text("status", {
    enum: ["extracting", "analyzing", "ready", "failed"],
  })
    .notNull()
    .default("extracting"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pages = sqliteTable("pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  text: text("text").notNull().default(""),
});

export type BBox = { x: number; y: number; w: number; h: number };

export const formulaSpans = sqliteTable("formula_spans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  bbox: text("bbox", { mode: "json" }).$type<BBox>().notNull(),
  text: text("text").notNull(),
  fontNames: text("font_names", { mode: "json" }).$type<string[]>().notNull().default([]),
  symbols: text("symbols", { mode: "json" }).$type<string[]>().notNull().default([]),
});

export const links = sqliteTable("links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  bbox: text("bbox", { mode: "json" }).$type<BBox>().notNull(),
  kind: text("kind", { enum: ["uri", "dest"] }).notNull(),
  url: text("url"),
  destName: text("dest_name"),
  destPage: integer("dest_page"),
  destX: real("dest_x"),
  destY: real("dest_y"),
});

export const glossary = sqliteTable("glossary", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  symbolUnicode: text("symbol_unicode").notNull(),
  symbolLatex: text("symbol_latex"),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
  firstPage: integer("first_page"),
  pages: text("pages", { mode: "json" }).$type<number[]>().notNull().default([]),
});

export const references = sqliteTable("references", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  label: text("label").notNull(),
  destName: text("dest_name"),
  rawText: text("raw_text").notNull().default(""),
  title: text("title"),
  authors: text("authors", { mode: "json" }).$type<string[]>().default([]),
  year: integer("year"),
  doi: text("doi"),
  arxivId: text("arxiv_id"),
  url: text("url"),
  resolvedPdfUrl: text("resolved_pdf_url"),
  abstract: text("abstract"),
});

export type NoteRect = BBox;

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  rects: text("rects", { mode: "json" }).$type<NoteRect[]>().notNull().default([]),
  quote: text("quote").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type MessageContent = unknown;

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperId: text("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content", { mode: "json" }).$type<MessageContent>().notNull(),
  quote: text("quote"),
  quotePage: integer("quote_page"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Paper = typeof papers.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type FormulaSpan = typeof formulaSpans.$inferSelect;
export type Link = typeof links.$inferSelect;
export type GlossaryEntry = typeof glossary.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Message = typeof messages.$inferSelect;
