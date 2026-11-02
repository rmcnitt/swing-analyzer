import type { AnnotationGeometry, AnnotationObject, Point } from "@/lib/types";
import { clamp, createId } from "@/lib/utils";
import { annotationSchema } from "@/lib/validation";

interface StageSize {
  width: number;
  height: number;
}

export function normalizePoint(point: Point, stageSize: StageSize): Point {
  if (stageSize.width === 0 || stageSize.height === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / stageSize.width,
    y: point.y / stageSize.height,
  };
}

export function denormalizePoint(point: Point, stageSize: StageSize): Point {
  return {
    x: point.x * stageSize.width,
    y: point.y * stageSize.height,
  };
}

export function geometryToAbsolute(
  geometry: AnnotationGeometry,
  stageSize: StageSize,
): AnnotationGeometry {
  switch (geometry.kind) {
    case "line":
    case "arrow":
      return {
        kind: geometry.kind,
        points: [
          denormalizePoint(geometry.points[0], stageSize),
          denormalizePoint(geometry.points[1], stageSize),
        ],
      };
    case "rectangle":
      return {
        kind: "rectangle",
        origin: denormalizePoint(geometry.origin, stageSize),
        size: {
          width: geometry.size.width * stageSize.width,
          height: geometry.size.height * stageSize.height,
        },
      };
    case "circle":
      return {
        kind: "circle",
        center: denormalizePoint(geometry.center, stageSize),
        radius: geometry.radius * Math.min(stageSize.width, stageSize.height),
      };
    case "angle":
      return {
        kind: "angle",
        points: [
          denormalizePoint(geometry.points[0], stageSize),
          denormalizePoint(geometry.points[1], stageSize),
          denormalizePoint(geometry.points[2], stageSize),
        ],
      };
    case "freehand":
      return {
        kind: "freehand",
        points: geometry.points.map((point) => denormalizePoint(point, stageSize)),
      };
  }
}

export function geometryToNormalized(
  geometry: AnnotationGeometry,
  stageSize: StageSize,
): AnnotationGeometry {
  switch (geometry.kind) {
    case "line":
    case "arrow":
      return {
        kind: geometry.kind,
        points: [
          normalizePoint(geometry.points[0], stageSize),
          normalizePoint(geometry.points[1], stageSize),
        ],
      };
    case "rectangle":
      return {
        kind: "rectangle",
        origin: normalizePoint(geometry.origin, stageSize),
        size: {
          width: geometry.size.width / stageSize.width,
          height: geometry.size.height / stageSize.height,
        },
      };
    case "circle":
      return {
        kind: "circle",
        center: normalizePoint(geometry.center, stageSize),
        radius: geometry.radius / Math.min(stageSize.width, stageSize.height),
      };
    case "angle":
      return {
        kind: "angle",
        points: [
          normalizePoint(geometry.points[0], stageSize),
          normalizePoint(geometry.points[1], stageSize),
          normalizePoint(geometry.points[2], stageSize),
        ],
      };
    case "freehand":
      return {
        kind: "freehand",
        points: geometry.points.map((point) => normalizePoint(point, stageSize)),
      };
  }
}

/**
 * Radius is normalized by the frame's shorter side, so a circle on a portrait (9:16) clip can
 * legitimately exceed 1. 2 covers the frame diagonal for any aspect ratio up to ~1:1.7 and
 * anything larger is off-frame anyway.
 */
export const MAX_NORMALIZED_RADIUS = 2;

function clampUnit(value: number) {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function clampPoint(point: Point): Point {
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}

/**
 * Forces normalized geometry into the frame. Pointer positions can land slightly outside the
 * stage (fast drags, sub-pixel rounding), and out-of-range values used to fail validation on
 * load, which discarded the entire session.
 */
export function clampGeometry(geometry: AnnotationGeometry): AnnotationGeometry {
  switch (geometry.kind) {
    case "line":
    case "arrow":
      return {
        kind: geometry.kind,
        points: [clampPoint(geometry.points[0]), clampPoint(geometry.points[1])],
      };
    case "rectangle": {
      const origin = clampPoint(geometry.origin);
      return {
        kind: "rectangle",
        origin,
        size: {
          width: clamp(clampUnit(geometry.size.width), 0, 1 - origin.x),
          height: clamp(clampUnit(geometry.size.height), 0, 1 - origin.y),
        },
      };
    }
    case "circle":
      return {
        kind: "circle",
        center: clampPoint(geometry.center),
        radius: Number.isFinite(geometry.radius)
          ? clamp(geometry.radius, 0, MAX_NORMALIZED_RADIUS)
          : 0,
      };
    case "angle":
      return {
        kind: "angle",
        points: [
          clampPoint(geometry.points[0]),
          clampPoint(geometry.points[1]),
          clampPoint(geometry.points[2]),
        ],
      };
    case "freehand":
      return { kind: "freehand", points: geometry.points.map(clampPoint) };
  }
}

interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Maps a pointer's client (viewport) position into unscaled stage pixels. `rect` is the stage
 * element's getBoundingClientRect(), which already includes any CSS zoom/pan transform, so
 * dividing by the rendered/unscaled ratio undoes the zoom.
 */
export function clientToStagePoint(
  client: Point,
  rect: ClientRect,
  stageSize: StageSize,
): Point | null {
  if (!rect.width || !rect.height || !stageSize.width || !stageSize.height) {
    return null;
  }

  return {
    x: ((client.x - rect.left) / rect.width) * stageSize.width,
    y: ((client.y - rect.top) / rect.height) * stageSize.height,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Minimum on-screen extent (in stage px) for a drag to count as a shape rather than a click. */
export const MIN_SHAPE_EXTENT_PX = 4;

/** True when a shape (in absolute stage px) is too small to be intentional, e.g. a stray click. */
export function isDegenerateShape(geometry: AnnotationGeometry, minExtent = MIN_SHAPE_EXTENT_PX) {
  switch (geometry.kind) {
    case "line":
    case "arrow":
      return distance(geometry.points[0], geometry.points[1]) < minExtent;
    case "rectangle":
      return geometry.size.width < minExtent || geometry.size.height < minExtent;
    case "circle":
      return geometry.radius < minExtent;
    case "angle":
      return (
        distance(geometry.points[0], geometry.points[1]) < minExtent ||
        distance(geometry.points[1], geometry.points[2]) < minExtent
      );
    case "freehand": {
      let length = 0;

      for (let index = 1; index < geometry.points.length; index += 1) {
        length += distance(geometry.points[index - 1], geometry.points[index]);
      }

      return length < minExtent;
    }
  }
}

export function serializeAnnotations(annotations: AnnotationObject[]) {
  return JSON.stringify(annotations);
}

export function parseAnnotations(payload: string) {
  return zodParseArray(JSON.parse(payload));
}

function zodParseArray(value: unknown) {
  return annotationSchema.array().parse(value);
}

export function createAnnotationBase(
  type: AnnotationObject["type"],
  paneId: AnnotationObject["paneId"],
  geometry: AnnotationGeometry,
  stroke: AnnotationObject["style"]["stroke"],
  zIndex: number,
): AnnotationObject {
  return {
    id: createId("annotation"),
    paneId,
    type,
    geometry: clampGeometry(geometry),
    style: {
      stroke,
      strokeWidth: 3,
      opacity: 1,
    },
    zIndex,
  };
}
