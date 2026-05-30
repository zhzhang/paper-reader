import { NextResponse } from "next/server";
import { getPaperById, getReferencesForPaper } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const paper = getPaperById(id);

  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  return NextResponse.json({
    paper: { ...paper, references: getReferencesForPaper(id) },
  });
}
