# Paper Reader

A local web app that helps researchers read arxiv papers **without losing their place**. It loads the LaTeXML **HTML** rendition of an arxiv paper and makes embedded links and formulas interactive:

- **Citations** open in a parallel panel instead of jumping you away. If the cited paper is on arxiv, its full text is rendered inline; otherwise you get a metadata card (title, abstract, link) resolved via Semantic Scholar.
- **Section / figure / equation / table references** are cloned into a parallel panel, so the main reading column never scrolls away from where you were.
- **Formula terms** are interactive: click a symbol (or select part of a formula) to get a concise, paper-grounded definition from Claude. The selected term and any math in the definition are rendered with KaTeX. Definitions are cached.

Parallel panels are tabbed and split the view evenly (and are resizable).

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript) — full-stack, runs locally
- **SQLite** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) — a single local file, no ORM or migration step
- Tailwind CSS + [`react-resizable-panels`](https://github.com/bvaughn/react-resizable-panels)
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) for Claude
- [`linkedom`](https://github.com/WebReflection/linkedom) for server-side HTML parsing
- Native browser **MathML** rendering for paper bodies; **[KaTeX](https://katex.org)** for rendering LaTeX in the term popover
- **[bun](https://bun.sh)** as the package manager and runtime (not npm)

## Getting started
Install [bun](https://bun.com/docs/installation), then:

```bash
bun install        # builds the better-sqlite3 native binary
bun run dev        # http://localhost:3000
```

The database is a single SQLite file created automatically on first run at `data/reader.db` (override with the `DATABASE_PATH` env var). The schema is initialized in code, so there is no migration step.

Then open the app, paste an arxiv link or id (e.g. `1706.03762` or `https://arxiv.org/abs/2310.06825`), and start reading.

### Claude API key

Formula-term definitions require a Claude API key. Click **Add API key** on the home screen and paste your key — it is cached in the local SQLite database (`Setting` table). You can also set `ANTHROPIC_API_KEY` in `.env`.

The model is chosen from a dropdown populated live from the Anthropic Models API (`/api/settings/models`); you can load the list using a key before saving it, or fall back to typing a model name manually. If no model is selected, it defaults to `CLAUDE_MODEL` (or `claude-3-5-sonnet-latest`).

## Data model

The SQLite schema (see `src/lib/db.ts`) has four tables: `Paper`, `Reference`, `TermDefinition`, and `Setting`. All data — parsed papers, resolved references, and cached term definitions — lives in the local `data/reader.db` file.

## How it works

1. **Ingest** (`src/lib/ingest.ts`): normalize the arxiv id, fetch `https://arxiv.org/html/{id}` (falling back to ar5iv for older papers), and persist.
2. **Parse** (`src/lib/parse.ts`): with `linkedom`, extract metadata + bibliography, classify every internal link by tagging `data-link-kind` / `data-target`, rewrite asset URLs to absolute, and sanitize while keeping MathML.
3. **Read** (`src/components/PaperHtml.tsx`): a delegated click handler intercepts the tagged links to open parallel panels, and a formula handler highlights the selected token and shows a `TermPopover` that calls `/api/terms/define`. The popover renders LaTeX via KaTeX (`src/components/Katex.tsx`), and Claude is prompted to return math wrapped in `$...$`.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run start` | Start the production server |

## Notes

- Only arxiv papers with an HTML rendition are supported (arxiv native HTML for recent submissions, ar5iv for the historical corpus).
- Papers, references, and term definitions are cached in SQLite so re-opening is instant.
