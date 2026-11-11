import type { PanelCorner } from "@/lib/types";

/** The corner of a `width`×`height` area nearest to point (x, y), e.g. where a dragged panel lands. */
export function nearestCorner(x: number, y: number, width: number, height: number): PanelCorner {
  const vertical = y < height / 2 ? "top" : "bottom";
  const horizontal = x < width / 2 ? "left" : "right";
  return `${vertical}-${horizontal}`;
}

/** Tailwind classes that pin an absolutely positioned panel into `corner`. */
export const CORNER_CLASSES: Record<PanelCorner, string> = {
  "top-left": "left-2 top-2",
  "top-right": "right-2 top-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};
