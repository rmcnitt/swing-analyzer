import type { AnnotationGeometry, AnnotationObject, Point } from "@/lib/types";
import { createId } from "@/lib/utils";
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
    geometry,
    style: {
      stroke,
      strokeWidth: 3,
      opacity: 1,
    },
    zIndex,
  };
}
