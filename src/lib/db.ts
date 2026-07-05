import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface PaperRow {
  id: string;
  arxivId: string;
  version: string | null;
  title: string;
  authors: string | null;
  abstract: string | null;
  pdf: Buffer;
  numPages: number;
  sourceUrl: string;
  createdAt: number;
}

export type PaperMetaRow = Omit<PaperRow, "pdf">;

export interface ReferenceRow {
  id: string;
  paperId: string;
  bibKey: string;
  rawText: string;
  title: string | null;
  resolvedArxivId: string | null;
  resolvedUrl: string | null;
  abstract: string | null;
  status: string;
}

export interface TermDefinitionRow {
  id: string;
  paperId: string;
  formulaTex: string;
  termTex: string;
  definition: string;
  source: string;
  createdAt: number;
}

export interface NewReference {
  bibKey: string;
  rawText: string;
  title?: string | null;
  resolvedArxivId?: string | null;
  resolvedUrl?: string | null;
  abstract?: string | null;
  status?: string;
}

// ---------------------------------------------------------------------------
// Connection (singleton, cached across dev hot reloads)
// ---------------------------------------------------------------------------

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "reader.db");

function createDb(): Database.Database {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Paper (
      id TEXT PRIMARY KEY,
      arxivId TEXT UNIQUE NOT NULL,
      version TEXT,
      title TEXT NOT NULL,
      authors TEXT,
      abstract TEXT,
      pdf BLOB NOT NULL,
      numPages INTEGER NOT NULL,
      sourceUrl TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Reference (
      id TEXT PRIMARY KEY,
      paperId TEXT NOT NULL,
      bibKey TEXT NOT NULL,
      rawText TEXT NOT NULL,
      title TEXT,
      resolvedArxivId TEXT,
      resolvedUrl TEXT,
      abstract TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE (paperId, bibKey),
      FOREIGN KEY (paperId) REFERENCES Paper(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS TermDefinition (
      id TEXT PRIMARY KEY,
      paperId TEXT NOT NULL,
      formulaTex TEXT NOT NULL,
      termTex TEXT NOT NULL,
      definition TEXT NOT NULL,
      source TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      UNIQUE (paperId, formulaTex, termTex),
      FOREIGN KEY (paperId) REFERENCES Paper(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

const globalForDb = globalThis as unknown as { db: Database.Database | undefined };
export const db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

// ---------------------------------------------------------------------------
// Papers
// ---------------------------------------------------------------------------

export function getPaperByArxivId(arxivId: string): PaperRow | undefined {
  return db
    .prepare("SELECT * FROM Paper WHERE arxivId = ?")
    .get(arxivId) as PaperRow | undefined;
}

export function getPaperById(id: string): PaperRow | undefined {
  return db.prepare("SELECT * FROM Paper WHERE id = ?").get(id) as
    | PaperRow
    | undefined;
}

export function getPaperMetaById(id: string): PaperMetaRow | undefined {
  return db
    .prepare(
      `SELECT id, arxivId, version, title, authors, abstract, numPages, sourceUrl, createdAt
       FROM Paper WHERE id = ?`,
    )
    .get(id) as PaperMetaRow | undefined;
}

export function listRecentPapers(limit = 30): Pick<
  PaperRow,
  "id" | "arxivId" | "title" | "authors" | "createdAt"
>[] {
  return db
    .prepare(
      "SELECT id, arxivId, title, authors, createdAt FROM Paper ORDER BY createdAt DESC LIMIT ?",
    )
    .all(limit) as Pick<
    PaperRow,
    "id" | "arxivId" | "title" | "authors" | "createdAt"
  >[];
}

export function getReferencesForPaper(paperId: string): ReferenceRow[] {
  return db
    .prepare("SELECT * FROM Reference WHERE paperId = ?")
    .all(paperId) as ReferenceRow[];
}

const insertPaperStmt = () =>
  db.prepare(
    `INSERT INTO Paper (id, arxivId, version, title, authors, abstract, pdf, numPages, sourceUrl, createdAt)
     VALUES (@id, @arxivId, @version, @title, @authors, @abstract, @pdf, @numPages, @sourceUrl, @createdAt)`,
  );

const insertReferenceStmt = () =>
  db.prepare(
    `INSERT INTO Reference (id, paperId, bibKey, rawText, title, resolvedArxivId, resolvedUrl, abstract, status)
     VALUES (@id, @paperId, @bibKey, @rawText, @title, @resolvedArxivId, @resolvedUrl, @abstract, @status)`,
  );

export function createPaperWithReferences(
  paper: Omit<PaperRow, "id" | "createdAt">,
  references: NewReference[],
): PaperRow {
  const row: PaperRow = { id: randomUUID(), createdAt: Date.now(), ...paper };
  const insertPaper = insertPaperStmt();
  const insertRef = insertReferenceStmt();

  const tx = db.transaction(() => {
    insertPaper.run(row);
    for (const r of references) {
      insertRef.run({
        id: randomUUID(),
        paperId: row.id,
        bibKey: r.bibKey,
        rawText: r.rawText,
        title: r.title ?? null,
        resolvedArxivId: r.resolvedArxivId ?? null,
        resolvedUrl: r.resolvedUrl ?? null,
        abstract: r.abstract ?? null,
        status: r.status ?? "pending",
      });
    }
  });
  tx();
  return row;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function getReferenceById(id: string): ReferenceRow | undefined {
  return db.prepare("SELECT * FROM Reference WHERE id = ?").get(id) as
    | ReferenceRow
    | undefined;
}

export function updateReference(
  id: string,
  patch: Partial<
    Pick<
      ReferenceRow,
      "title" | "resolvedArxivId" | "resolvedUrl" | "abstract" | "status"
    >
  >,
): ReferenceRow {
  const current = getReferenceById(id);
  if (!current) throw new Error("Reference not found.");
  const next: ReferenceRow = { ...current, ...patch };
  db.prepare(
    `UPDATE Reference
     SET title = @title, resolvedArxivId = @resolvedArxivId, resolvedUrl = @resolvedUrl,
         abstract = @abstract, status = @status
     WHERE id = @id`,
  ).run(next);
  return next;
}

// ---------------------------------------------------------------------------
// Term definitions
// ---------------------------------------------------------------------------

export function getTermDefinition(
  paperId: string,
  formulaTex: string,
  termTex: string,
): TermDefinitionRow | undefined {
  return db
    .prepare(
      "SELECT * FROM TermDefinition WHERE paperId = ? AND formulaTex = ? AND termTex = ?",
    )
    .get(paperId, formulaTex, termTex) as TermDefinitionRow | undefined;
}

export function createTermDefinition(input: {
  paperId: string;
  formulaTex: string;
  termTex: string;
  definition: string;
  source: string;
}): void {
  db.prepare(
    `INSERT OR IGNORE INTO TermDefinition
       (id, paperId, formulaTex, termTex, definition, source, createdAt)
     VALUES (@id, @paperId, @formulaTex, @termTex, @definition, @source, @createdAt)`,
  ).run({ id: randomUUID(), createdAt: Date.now(), ...input });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettingRow(key: string): string | null {
  const row = db.prepare("SELECT value FROM Setting WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSettingRow(key: string, value: string): void {
  db.prepare(
    `INSERT INTO Setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
