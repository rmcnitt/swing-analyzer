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

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const drawingStyleSchema = z.object({
  stroke: z.string(),
  fill: z.string().optional(),
  strokeWidth: z.number().positive(),
  opacity: z.number().min(0).max(1),
});

export const annotationSchema = z.object({
  id: z.string(),
  paneId: z.enum(["primary", "secondary"]),
  type: z.enum(["line", "arrow", "rectangle", "circle", "angle", "freehand"]),
  geometry: z.discriminatedUnion("kind", [
    z.object({
      kind: z.enum(["line", "arrow"]),
      points: z.tuple([pointSchema, pointSchema]),
    }),
    z.object({
      kind: z.literal("rectangle"),
      origin: pointSchema,
      size: z.object({
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      }),
    }),
    z.object({
      kind: z.literal("circle"),
      center: pointSchema,
      radius: z.number().min(0).max(1),
    }),
    z.object({
      kind: z.literal("angle"),
      points: z.tuple([pointSchema, pointSchema, pointSchema]),
    }),
    z.object({
      kind: z.literal("freehand"),
      points: z.array(pointSchema).min(2),
    }),
  ]),
  style: drawingStyleSchema,
  label: z.string().optional(),
  frameBinding: z.number().optional(),
  zIndex: z.number(),
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
  snapshotMarkers: z.array(
    z.object({
      id: z.string(),
      paneId: z.enum(["primary", "secondary"]),
      label: z.string(),
      time: z.number().min(0),
      notes: z.string().optional(),
    }),
  ),
  selectedProSwingId: z.string().optional(),
});
