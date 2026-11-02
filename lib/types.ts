export type PaneId = "primary" | "secondary";

export type SwingOrientation = "face-on" | "down-the-line";
export type UploadStatus = "ready" | "processing";
/** "user": the user's own swings (sessions). "reference": clips imported to compare against. */
export type VideoSourceType = "user" | "reference";
export type AnnotationTool =
  | "select"
  | "line"
  | "arrow"
  | "rectangle"
  | "circle"
  | "angle"
  | "freehand"
  | "zoom-pan";

export type HexColor = string;

export interface Point {
  x: number;
  y: number;
}

export interface DrawingStyle {
  stroke: HexColor;
  fill?: HexColor;
  strokeWidth: number;
  opacity: number;
}

export interface VideoAsset {
  id: string;
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  ownerId: string;
  ownerName: string;
  sourceType: VideoSourceType;
  duration: number;
  fps?: number;
  /** How `fps` was set. Undefined means a default/legacy value worth re-detecting. */
  fpsSource?: "detected" | "manual";
  /** Original file's MIME type, kept for playback troubleshooting. */
  mimeType?: string;
  orientation: SwingOrientation;
  clubTag: string;
  uploadStatus: UploadStatus;
  createdAt: string;
}

export interface AnalysisPane {
  id: PaneId;
  label: string;
  videoId?: string;
  overlayVisible: boolean;
  playbackRate: number;
  currentTime: number;
}

export type AnnotationGeometry =
  | {
      kind: "line" | "arrow";
      points: [Point, Point];
    }
  | {
      kind: "rectangle";
      origin: Point;
      size: {
        width: number;
        height: number;
      };
    }
  | {
      kind: "circle";
      center: Point;
      radius: number;
    }
  | {
      kind: "angle";
      points: [Point, Point, Point];
    }
  | {
      kind: "freehand";
      points: Point[];
    };

export interface AnnotationObject {
  id: string;
  paneId: PaneId;
  type: Exclude<AnnotationTool, "select" | "zoom-pan">;
  geometry: AnnotationGeometry;
  style: DrawingStyle;
  label?: string;
  frameBinding?: number;
  zIndex: number;
}

export interface SnapshotMarker {
  id: string;
  paneId: PaneId;
  label: string;
  time: number;
  notes?: string;
}

export interface UserNote {
  id: string;
  time?: number;
  content: string;
}

export interface AnalysisSession {
  id: string;
  userId: string;
  title: string;
  primaryVideoId: string;
  secondaryVideoId?: string;
  syncEnabled: boolean;
  playbackDefaults: {
    speed: number;
  };
  notes: string;
  lastOpenedAt: string;
  panes: AnalysisPane[];
  annotations: Record<PaneId, AnnotationObject[]>;
  snapshotMarkers: SnapshotMarker[];
}
