# Paper Reader

Local app for reading research PDFs with Claude: ask about highlights, hover formulas for definitions, open references without losing your place, and attach notes to spots in the paper.

## Setup

```bash
bun install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Without an API key you can still ingest PDFs, hover formula hits (fallback glossary), open citations in the drawer, and take notes. Claude-backed glossary/bibliography extraction, Ask, and Explain need `ANTHROPIC_API_KEY`.

## Usage

- Upload a PDF, or paste an arXiv id/URL or any PDF URL.
- Select text → **Ask** (Claude) or **Note**.
- Hover math spans for glossary definitions; use **Explain** when missing.
- Click citations or figure/equation links to open a drawer or peek; the main PDF stays put.
- Glossary, notes, and chat live in the right rail.

## Stack notes

- Next.js 16 App Router + Bun
- SQLite via `drizzle-orm` / `bun:sqlite` (`data/app.db`)
- PDF render: `pdfjs-dist` (canvas + custom text/link overlays)
- PDF ingest extract: `unpdf`
- Claude: `@anthropic-ai/sdk` with PDF document blocks + citations

Data is stored in `data/` (SQLite + PDFs). Not committed to git.
