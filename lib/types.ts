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

/** Cross-pane coordination messages; `version` makes repeated identical signals distinct. */
export interface SyncSignal {
  paneId: PaneId;
  time: number;
  version: number;
}

export interface PlaybackSignal {
  paneId: PaneId;
  action: "play" | "pause" | "seek" | "rate";
  time?: number;
  rate?: number;
  version: number;
}

export interface MarkerSeekSignal {
  paneId: PaneId;
  time: number;
  version: number;
}
