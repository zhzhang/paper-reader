import type { BBox } from "@/db/schema";

/** Convert a PDF-space text item (baseline origin, bottom-left) to normalized top-left bbox. */
export function pdfItemToBBox(
  transform: number[],
  width: number,
  height: number,
  pageView: number[],
): BBox {
  const [, , , , tx, ty] = transform;
  const [vx, vy, vx2, vy2] = pageView;
  const pageW = vx2 - vx;
  const pageH = vy2 - vy;
  const x = (tx - vx) / pageW;
  const yTopPdf = ty + height;
  const y = (vy2 - yTopPdf) / pageH;
  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(width / pageW),
    h: clamp01(height / pageH),
  };
}

/** Convert a PDF annotation rect [x1,y1,x2,y2] (bottom-left origin) to normalized top-left bbox. */
export function pdfRectToBBox(rect: number[], pageView: number[]): BBox {
  const [x1, y1, x2, y2] = rect;
  const [vx, vy, vx2, vy2] = pageView;
  const pageW = vx2 - vx;
  const pageH = vy2 - vy;
  return {
    x: clamp01((x1 - vx) / pageW),
    y: clamp01((vy2 - y2) / pageH),
    w: clamp01((x2 - x1) / pageW),
    h: clamp01((y2 - y1) / pageH),
  };
}

/** Merge multiple bboxes into one covering rect. */
export function unionBBoxes(boxes: BBox[]): BBox {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Convert a DOM ClientRect relative to a page element into a normalized bbox. */
export function clientRectToBBox(
  rect: DOMRect | DOMRectReadOnly,
  pageEl: Element,
): BBox {
  const page = pageEl.getBoundingClientRect();
  return {
    x: clamp01((rect.left - page.left) / page.width),
    y: clamp01((rect.top - page.top) / page.height),
    w: clamp01(rect.width / page.width),
    h: clamp01(rect.height / page.height),
  };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Convert PDF destination Y (bottom-left) to normalized top-left fraction. */
export function pdfYToFraction(destY: number | null | undefined, pageHeight: number): number {
  if (destY == null || !pageHeight) return 0;
  return clamp01(1 - destY / pageHeight);
}
