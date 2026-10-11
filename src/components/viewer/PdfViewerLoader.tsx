"use client";

import type { PaperDetail } from "@/lib/types";
import { PdfViewer } from "./PdfViewer";

type Props = {
  paper: PaperDetail;
  onCreateNote: (payload: {
    pageNumber: number;
    quote: string;
    rects: { x: number; y: number; w: number; h: number }[];
  }) => void;
};

export function PdfViewerLoader(props: Props) {
  return <PdfViewer {...props} />;
}
