import type { AnnotationGeometry, Point } from "@/lib/types";
import { clamp } from "@/lib/utils";

/**
 * Editing math for annotation shapes. Everything here works in absolute stage pixels; callers
 * convert to/from normalized storage with geometryToAbsolute / geometryToNormalized.
 */

interface Size {
  width: number;
  height: number;
}

function rectCorners(geometry: Extract<AnnotationGeometry, { kind: "rectangle" }>): Point[] {
  const { origin, size } = geometry;

  return [
    origin,
    { x: origin.x + size.width, y: origin.y },
    { x: origin.x + size.width, y: origin.y + size.height },
    { x: origin.x, y: origin.y + size.height },
  ];
}

/** Draggable handles for a selected shape, indexed for `moveHandle`. */
export function shapeHandles(geometry: AnnotationGeometry): Point[] {
  switch (geometry.kind) {
    case "line":
    case "arrow":
    case "plane":
    case "angle":
      return [...geometry.points];
    case "rectangle":
      return rectCorners(geometry);
    case "circle":
      return [{ x: geometry.center.x + geometry.radius, y: geometry.center.y }];
    case "freehand":
      return [];
  }
}

/** The shape with handle `index` dragged to `point`. */
export function moveHandle(geometry: AnnotationGeometry, index: number, point: Point): AnnotationGeometry {
  switch (geometry.kind) {
    case "line":
    case "arrow":
    case "plane": {
      const points: [Point, Point] = [...geometry.points];
      points[index] = point;
      return { kind: geometry.kind, points };
    }
    case "angle": {
      const points: [Point, Point, Point] = [...geometry.points];
      points[index] = point;
      return { kind: "angle", points };
    }
    case "rectangle": {
      // The opposite corner stays put; dragging past it flips the box.
      const anchor = rectCorners(geometry)[(index + 2) % 4];

      return {
        kind: "rectangle",
        origin: { x: Math.min(anchor.x, point.x), y: Math.min(anchor.y, point.y) },
        size: { width: Math.abs(point.x - anchor.x), height: Math.abs(point.y - anchor.y) },
      };
    }
    case "circle":
      return {
        kind: "circle",
        center: geometry.center,
        radius: Math.hypot(point.x - geometry.center.x, point.y - geometry.center.y),
      };
    case "freehand":
      return geometry;
  }
}

/** Points that must stay inside the frame when a shape is moved. */
function anchorPoints(geometry: AnnotationGeometry): Point[] {
  switch (geometry.kind) {
    case "circle":
      // A circle may hang off the frame edge (e.g. around a head near the top); keep its centre in.
      return [geometry.center];
    case "freehand":
      return geometry.points;
    default:
      return shapeHandles(geometry);
  }
}

function offset(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y };
}

/** Moves the whole shape by `delta`, limited so it stays inside the frame without distorting. */
export function translateGeometry(geometry: AnnotationGeometry, delta: Point, stage: Size): AnnotationGeometry {
  const points = anchorPoints(geometry);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const d = {
    x: clamp(delta.x, -minX, stage.width - maxX),
    y: clamp(delta.y, -minY, stage.height - maxY),
  };

  switch (geometry.kind) {
    case "line":
    case "arrow":
    case "plane":
      return { kind: geometry.kind, points: [offset(geometry.points[0], d), offset(geometry.points[1], d)] };
    case "angle":
      return {
        kind: "angle",
        points: [offset(geometry.points[0], d), offset(geometry.points[1], d), offset(geometry.points[2], d)],
      };
    case "rectangle":
      return { kind: "rectangle", origin: offset(geometry.origin, d), size: geometry.size };
    case "circle":
      return { kind: "circle", center: offset(geometry.center, d), radius: geometry.radius };
    case "freehand":
      return { kind: "freehand", points: geometry.points.map((point) => offset(point, d)) };
  }
}

/**
 * The line through `a` and `b` clipped to the stage, for plane lines that run edge to edge.
 * Returns the input when the points coincide.
 */
export function extendLineToFrame(a: Point, b: Point, stage: Size): [Point, Point] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (Math.hypot(dx, dy) < 1e-9) {
    return [a, b];
  }

  // Liang–Barsky over an unbounded parameter range.
  let t0 = -Infinity;
  let t1 = Infinity;
  const edges: Array<[number, number]> = [
    [-dx, a.x],
    [dx, stage.width - a.x],
    [-dy, a.y],
    [dy, stage.height - a.y],
  ];

  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      // Parallel to this edge: either always inside its slab or never.
      if (q < 0) {
        return [a, b];
      }

      continue;
    }

    const t = q / p;

    if (p < 0) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }
  }

  if (t0 > t1) {
    return [a, b];
  }

  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

/** Where to draw a shape's text label (top-left of the text). */
export function labelAnchor(geometry: AnnotationGeometry): Point {
  switch (geometry.kind) {
    case "line":
    case "arrow":
    case "plane": {
      const [a, b] = geometry.points;
      return { x: (a.x + b.x) / 2 + 8, y: (a.y + b.y) / 2 - 22 };
    }
    case "angle":
      return { x: geometry.points[1].x + 8, y: geometry.points[1].y + 26 };
    case "rectangle":
      return { x: geometry.origin.x, y: geometry.origin.y - 20 };
    case "circle":
      return { x: geometry.center.x - geometry.radius, y: geometry.center.y - geometry.radius - 20 };
    case "freehand":
      return { x: geometry.points[0].x + 8, y: geometry.points[0].y - 20 };
  }
}

/** Interior angle at the middle point, in whole degrees. */
export function angleBetween(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);

  if (!magnitude) {
    return 0;
  }

  const cosine = clamp((ab.x * cb.x + ab.y * cb.y) / magnitude, -1, 1);
  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}
