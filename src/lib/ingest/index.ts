import { eq } from "drizzle-orm";
import { db, schema, sqlite } from "@/db";
import { acquireFromUpload, acquireFromUrl } from "./acquire";
import { extractPdf } from "./extract";
import { analyzePaper } from "./analyze";

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function startIngestFromUpload(file: File): Promise<string> {
  const id = newId();
  const acquired = await acquireFromUpload(id, file);
  insertStub(id, acquired);
  void runPipeline(id, acquired.bytes, acquired.filePath, acquired.title, acquired.authors);
  return id;
}

export async function startIngestFromUrl(url: string): Promise<string> {
  const id = newId();
  const acquired = await acquireFromUrl(id, url);
  insertStub(id, acquired);
  void runPipeline(id, acquired.bytes, acquired.filePath, acquired.title, acquired.authors);
  return id;
}

function insertStub(
  id: string,
  acquired: {
    filePath: string;
    source: "upload" | "arxiv" | "url";
    sourceUrl: string | null;
    arxivId: string | null;
    title: string | null;
    authors: string[];
  },
) {
  db.insert(schema.papers)
    .values({
      id,
      title: acquired.title ?? "Untitled",
      authors: acquired.authors,
      source: acquired.source,
      sourceUrl: acquired.sourceUrl,
      arxivId: acquired.arxivId,
      filePath: acquired.filePath,
      status: "extracting",
      createdAt: new Date(),
    })
    .run();
}

function chunkedInsert<T>(
  rows: T[],
  insert: (batch: T[]) => void,
  size = 200,
) {
  for (let i = 0; i < rows.length; i += size) {
    insert(rows.slice(i, i + size));
  }
}

async function runPipeline(
  id: string,
  bytes: Uint8Array,
  filePath: string,
  seedTitle: string | null,
  seedAuthors: string[],
) {
  try {
    const extracted = await extractPdf(bytes);
    const title = seedTitle || extracted.title || "Untitled";

    const writeExtract = sqlite.transaction(() => {
      db.update(schema.papers)
        .set({
          title,
          authors: seedAuthors,
          pageCount: extracted.pageCount,
          status: "analyzing",
        })
        .where(eq(schema.papers.id, id))
        .run();

      if (extracted.pages.length) {
        chunkedInsert(extracted.pages, (batch) => {
          db.insert(schema.pages)
            .values(
              batch.map((p) => ({
                paperId: id,
                pageNumber: p.pageNumber,
                width: p.width,
                height: p.height,
                text: p.text,
              })),
            )
            .run();
        });
      }

      if (extracted.formulas.length) {
        chunkedInsert(extracted.formulas, (batch) => {
          db.insert(schema.formulaSpans)
            .values(
              batch.map((f) => ({
                paperId: id,
                pageNumber: f.pageNumber,
                bbox: f.bbox,
                text: f.text,
                fontNames: f.fontNames,
                symbols: f.symbols,
              })),
            )
            .run();
        });
      }

      if (extracted.links.length) {
        chunkedInsert(extracted.links, (batch) => {
          db.insert(schema.links)
            .values(
              batch.map((l) => ({
                paperId: id,
                pageNumber: l.pageNumber,
                bbox: l.bbox,
                kind: l.kind,
                url: l.url,
                destName: l.destName,
                destPage: l.destPage,
                destX: l.destX,
                destY: l.destY,
              })),
            )
            .run();
        });
      }
    });
    writeExtract();

    const citeDests = extracted.links
      .filter((l) => l.destName?.startsWith("cite."))
      .map((l) => l.destName!)
      .filter((v, i, a) => a.indexOf(v) === i);

    const analysis = await analyzePaper({
      filePath,
      title,
      pageCount: extracted.pageCount,
      pageTexts: extracted.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`),
      formulaTexts: extracted.formulas.map((f) => f.text),
    });

    const refsToInsert =
      analysis.references.length > 0
        ? analysis.references.map((r, i) => {
            const destName =
              citeDests.find((d) => {
                const key = d.replace(/^cite\./i, "").toLowerCase();
                const label = r.label.toLowerCase();
                const titleBits = (r.title ?? "").toLowerCase().slice(0, 20);
                return (
                  key.includes(label) ||
                  label.includes(key) ||
                  (titleBits && key.includes(titleBits.replace(/\s+/g, "")))
                );
              }) ??
              citeDests[i] ??
              null;
            return {
              paperId: id,
              ordinal: i + 1,
              label: r.label,
              destName,
              rawText: r.rawText ?? "",
              title: r.title ?? null,
              authors: r.authors ?? [],
              year: r.year ?? null,
              doi: r.doi ?? null,
              arxivId: r.arxivId ?? null,
              url: r.url ?? null,
            };
          })
        : citeDests.map((destName, i) => ({
            paperId: id,
            ordinal: i + 1,
            label: String(i + 1),
            destName,
            rawText: destName.replace(/^cite\./i, ""),
            title: destName.replace(/^cite\./i, ""),
            authors: [] as string[],
            year: null as number | null,
            doi: null as string | null,
            arxivId: null as string | null,
            url: null as string | null,
          }));

    const writeAnalysis = sqlite.transaction(() => {
      if (analysis.glossary.length) {
        chunkedInsert(analysis.glossary, (batch) => {
          db.insert(schema.glossary)
            .values(
              batch.map((g) => ({
                paperId: id,
                symbolUnicode: g.symbolUnicode,
                symbolLatex: g.symbolLatex ?? null,
                name: g.name,
                definition: g.definition,
                firstPage: g.pages?.[0] ?? null,
                pages: g.pages ?? [],
              })),
            )
            .run();
        });
      }

      if (refsToInsert.length) {
        chunkedInsert(refsToInsert, (batch) => {
          db.insert(schema.references).values(batch).run();
        });
      }

      db.update(schema.papers)
        .set({ status: "ready", error: null })
        .where(eq(schema.papers.id, id))
        .run();
    });
    writeAnalysis();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest failed", id, message);
    try {
      db.update(schema.papers)
        .set({ status: "failed", error: message })
        .where(eq(schema.papers.id, id))
        .run();
    } catch (updateErr) {
      console.error("Failed to mark paper failed", updateErr);
    }
  }
}
