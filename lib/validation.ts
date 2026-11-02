import { z } from "zod";

export const videoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  ownerId: z.string(),
  ownerName: z.string(),
  sourceType: z.enum(["user", "pro", "local"]),
  duration: z.number(),
  fps: z.number().optional(),
  orientation: z.enum(["face-on", "down-the-line"]),
  clubTag: z.string(),
  uploadStatus: z.enum(["ready", "processing"]),
  createdAt: z.string(),
});

const drawingStyleSchema = z.object({
  stroke: z.string(),
  fill: z.string().optional(),
  strokeWidth: z.number().positive(),
  opacity: z.number().min(0).max(1),
});

// Keep in sync with MAX_NORMALIZED_RADIUS in lib/analysis/annotations.ts (radius is normalized by
// the frame's shorter side, so it can exceed 1 on portrait clips).
const maxNormalizedRadius = 2;

function createAnnotationSchema(unit: z.ZodNumber, radius: z.ZodNumber) {
  const point = z.object({ x: unit, y: unit });

  return z.object({
    id: z.string(),
    paneId: z.enum(["primary", "secondary"]),
    type: z.enum(["line", "arrow", "rectangle", "circle", "angle", "freehand"]),
    geometry: z.discriminatedUnion("kind", [
      z.object({
        kind: z.enum(["line", "arrow"]),
        points: z.tuple([point, point]),
      }),
      z.object({
        kind: z.literal("rectangle"),
        origin: point,
        size: z.object({ width: unit, height: unit }),
      }),
      z.object({
        kind: z.literal("circle"),
        center: point,
        radius,
      }),
      z.object({
        kind: z.literal("angle"),
        points: z.tuple([point, point, point]),
      }),
      z.object({
        kind: z.literal("freehand"),
        points: z.array(point).min(2),
      }),
    ]),
    style: drawingStyleSchema,
    label: z.string().optional(),
    frameBinding: z.number().optional(),
    zIndex: z.number(),
  });
}

/** Strict: normalized coordinates must lie inside the frame. */
export const annotationSchema = createAnnotationSchema(
  z.number().min(0).max(1),
  z.number().min(0).max(maxNormalizedRadius),
);

/**
 * Structure-only: any finite coordinates. Used when salvaging stored sessions so shapes saved
 * slightly out of range (before creation-time clamping) can be clamped instead of discarded.
 */
export const looseAnnotationSchema = createAnnotationSchema(z.number(), z.number());

export const markerSchema = z.object({
  id: z.string(),
  paneId: z.enum(["primary", "secondary"]),
  label: z.string(),
  time: z.number().min(0),
  notes: z.string().optional(),
});

export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  primaryVideoId: z.string(),
  secondaryVideoId: z.string().optional(),
  syncEnabled: z.boolean(),
  playbackDefaults: z.object({
    speed: z.number(),
  }),
  notes: z.string(),
  lastOpenedAt: z.string(),
  panes: z.array(
    z.object({
      id: z.enum(["primary", "secondary"]),
      label: z.string(),
      videoId: z.string().optional(),
      overlayVisible: z.boolean(),
      playbackRate: z.number(),
      currentTime: z.number().min(0),
    }),
  ),
  annotations: z.object({
    primary: z.array(annotationSchema),
    secondary: z.array(annotationSchema),
  }),
  snapshotMarkers: z.array(markerSchema),
  selectedProSwingId: z.string().optional(),
});
