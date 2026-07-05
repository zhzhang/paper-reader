import { NextResponse } from "next/server";
import { getPaperById } from "@/lib/db";

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

  return new NextResponse(new Uint8Array(paper.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
