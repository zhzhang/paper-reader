import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "app.db");

mkdirSync(join(DATA_DIR, "pdfs"), { recursive: true });

type GlobalDb = {
  __paperReaderSqlite?: Database;
};

const globalForDb = globalThis as typeof globalThis & GlobalDb;

function openSqlite(): Database {
  const sqlite = new Database(DB_PATH, { create: true });
  // Wait for writers instead of failing immediately under concurrent route handlers.
  sqlite.exec("PRAGMA busy_timeout = 10000;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA wal_autocheckpoint = 1000;");

  sqlite.exec(`
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  authors TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  source_url TEXT,
  arxiv_id TEXT,
  doi TEXT,
  file_path TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'extracting',
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS formula_spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  bbox TEXT NOT NULL,
  text TEXT NOT NULL,
  font_names TEXT NOT NULL DEFAULT '[]',
  symbols TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  bbox TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT,
  dest_name TEXT,
  dest_page INTEGER,
  dest_x REAL,
  dest_y REAL
);

CREATE TABLE IF NOT EXISTS glossary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  symbol_unicode TEXT NOT NULL,
  symbol_latex TEXT,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  first_page INTEGER,
  pages TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS "references" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  label TEXT NOT NULL,
  dest_name TEXT,
  raw_text TEXT NOT NULL DEFAULT '',
  title TEXT,
  authors TEXT DEFAULT '[]',
  year INTEGER,
  doi TEXT,
  arxiv_id TEXT,
  url TEXT,
  resolved_pdf_url TEXT,
  abstract TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  rects TEXT NOT NULL DEFAULT '[]',
  quote TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  quote TEXT,
  quote_page INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_paper ON pages(paper_id);
CREATE INDEX IF NOT EXISTS idx_formula_paper ON formula_spans(paper_id);
CREATE INDEX IF NOT EXISTS idx_links_paper ON links(paper_id);
CREATE INDEX IF NOT EXISTS idx_glossary_paper ON glossary(paper_id);
CREATE INDEX IF NOT EXISTS idx_refs_paper ON "references"(paper_id);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id);
CREATE INDEX IF NOT EXISTS idx_messages_paper ON messages(paper_id);
`);

  return sqlite;
}

// Reuse one connection across Turbopack HMR / route-handler reloads.
const sqlite = globalForDb.__paperReaderSqlite ?? openSqlite();
globalForDb.__paperReaderSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
export const dataDir = DATA_DIR;
export const pdfsDir = join(DATA_DIR, "pdfs");
