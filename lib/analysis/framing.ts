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

/**
 * Zoom and pan that fill the whole viewport with video (no empty margins) while showing no more
 * than `crop`'s width of the frame, centred on `crop` as far as the frame edges allow. For a fixed
 * showcase framing (the landing hero); `crop`'s height only sets the vertical centre.
 */
export function coverFraming(crop: NormalizedRect, stage: Size, viewport: Size): Framing {
  if (crop.width <= 0 || stage.width <= 0 || stage.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } };
  }

  const zoom = Math.max(
    viewport.width / stage.width,
    viewport.height / stage.height,
    viewport.width / (crop.width * stage.width),
  );
  const offsetX = (crop.x + crop.width / 2 - 0.5) * stage.width;
  const offsetY = (crop.y + crop.height / 2 - 0.5) * stage.height;
  // The stage is centred in the viewport and scaled about its centre: keep it covering the viewport.
  const maxX = Math.max(0, (stage.width * zoom - viewport.width) / 2);
  const maxY = Math.max(0, (stage.height * zoom - viewport.height) / 2);

  return {
    zoom: Number(zoom.toFixed(3)),
    pan: { x: clamp(-offsetX * zoom, -maxX, maxX), y: clamp(-offsetY * zoom, -maxY, maxY) },
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
