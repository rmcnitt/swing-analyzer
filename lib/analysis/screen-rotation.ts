import type { Point } from "@/lib/types";

/**
 * When compare runs on a phone held upright, the workspace is drawn turned 90° clockwise
 * (`ROTATED_STYLE`). Pointer events still report screen coordinates, so anything that turns a
 * pointer into a position (drawing, scrubbing handles, panning, the golfer box) maps it back into
 * the workspace's own, unrotated layout first with `layoutPoint` / `layoutRect`.
 */

/** Turned 90° clockwise about its top-left corner, then shifted right so it fills the screen. */
export const ROTATED_STYLE = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100dvh",
  height: "100vw",
  minHeight: 0,
  transform: "translateX(100vw) rotate(90deg)",
  transformOrigin: "top left",
} as const;

export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A screen point → the rotated layout's coordinates. Layout (x, y) is drawn at screen (vw − y, x). */
export function unrotatePoint(point: Point, viewportWidth: number): Point {
  return { x: point.y, y: viewportWidth - point.x };
}

/** A screen-space bounding box (getBoundingClientRect) → the box in the rotated layout. */
export function unrotateRect(
  rect: { left: number; top: number; right: number; bottom: number },
  viewportWidth: number,
): LayoutRect {
  return {
    left: rect.top,
    top: viewportWidth - rect.right,
    width: rect.bottom - rect.top,
    height: rect.right - rect.left,
  };
}

let rotated = false;

/** Set by the workspace whenever it turns the screen (or stops). */
export function setScreenRotated(next: boolean) {
  rotated = next;
}

export function isScreenRotated() {
  return rotated;
}

const viewportWidth = () => (typeof window === "undefined" ? 0 : window.innerWidth);

/** Pointer client coordinates in the workspace's layout space (unchanged unless rotated). */
export function layoutPoint(clientX: number, clientY: number): Point {
  return rotated ? unrotatePoint({ x: clientX, y: clientY }, viewportWidth()) : { x: clientX, y: clientY };
}

/** An element's box in the workspace's layout space (unchanged unless rotated). */
export function layoutRect(element: Element): LayoutRect {
  const rect = element.getBoundingClientRect();
  return rotated
    ? unrotateRect(rect, viewportWidth())
    : { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}
