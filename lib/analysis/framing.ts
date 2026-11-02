import { clamp } from "@/lib/utils";
import type { NormalizedRect, Point } from "@/lib/types";

export interface Size {
  width: number;
  height: number;
}

export interface Framing {
  zoom: number;
  /** Pixel offset applied before scaling about the stage centre. */
  pan: Point;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Keeps the scaled stage covering its own box so panning never reveals empty space. */
export function clampPan(pan: Point, stage: Size, zoom: number): Point {
  const maxX = (stage.width * (zoom - 1)) / 2;
  const maxY = (stage.height * (zoom - 1)) / 2;

  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}

/**
 * Zoom and pan that make `box` (the golfer, normalized to the frame) fill `fill` of the
 * viewport and sit in its centre, so golfers filmed at different distances appear the same
 * size in each compare pane. Limited by the zoom range and the stage edges.
 */
export function fitFraming(box: NormalizedRect, stage: Size, viewport: Size, fill = 0.88): Framing {
  if (box.width <= 0 || box.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }

  const zoom = clamp(
    Math.min(
      (fill * viewport.height) / (box.height * stage.height),
      (fill * viewport.width) / (box.width * stage.width),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  // Box centre relative to the stage centre, in unscaled stage pixels.
  const offsetX = (box.x + box.width / 2 - 0.5) * stage.width;
  const offsetY = (box.y + box.height / 2 - 0.5) * stage.height;

  return {
    zoom: Number(zoom.toFixed(3)),
    pan: clampPan({ x: -offsetX * zoom, y: -offsetY * zoom }, stage, zoom),
  };
}

/** The rectangle spanned by two normalized points, clipped to the frame. */
export function rectFromPoints(a: Point, b: Point): NormalizedRect {
  const x0 = clamp(Math.min(a.x, b.x), 0, 1);
  const y0 = clamp(Math.min(a.y, b.y), 0, 1);
  const x1 = clamp(Math.max(a.x, b.x), 0, 1);
  const y1 = clamp(Math.max(a.y, b.y), 0, 1);

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
