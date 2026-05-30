import { notFound } from "next/navigation";
import { getPaperById, getReferencesForPaper } from "@/lib/db";
import { Reader } from "@/components/Reader";
import type { PaperFull } from "@/lib/types";
import "@/styles/paper.css";

export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paper = getPaperById(id);

  if (!paper) notFound();

  const full: PaperFull = {
    id: paper.id,
    arxivId: paper.arxivId,
    version: paper.version,
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
    html: paper.html,
    sourceUrl: paper.sourceUrl,
    references: getReferencesForPaper(id),
  };

  return <Reader paper={full} />;
}
