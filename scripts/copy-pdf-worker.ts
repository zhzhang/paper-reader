import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const src = join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = join(process.cwd(), "public/pdf.worker.min.mjs");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.worker.min.mjs to public/");
