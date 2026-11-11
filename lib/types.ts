export type PaneId = "primary" | "secondary";

export type SwingOrientation = "face-on" | "down-the-line";
export type UploadStatus = "ready" | "processing";
/** "user": the user's own swings (sessions). "reference": clips imported to compare against. */
export type VideoSourceType = "user" | "reference";
export type AnnotationTool =
  | "select"
  | "line"
  | "arrow"
  /** A line through two points, drawn edge to edge (swing plane, shaft line). */
  | "plane"
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

/** A rectangle in normalized (0–1) frame coordinates. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Where the golfer is in the frame; used to frame golfers alike when comparing. */
  golferBox?: NormalizedRect;
  /** The golfer's height (inches) for swing-check measurements; reference clips only. */
  golferHeightInches?: number;
  orientation: SwingOrientation;
  clubTag: string;
  uploadStatus: UploadStatus;
  createdAt: string;
}

/** In/out points (seconds) for looped playback. */
export interface LoopRange {
  start: number;
  end: number;
}

export interface AnalysisPane {
  id: PaneId;
  label: string;
  videoId?: string;
  overlayVisible: boolean;
  playbackRate: number;
  currentTime: number;
  /** Zoom to the clip's golfer box instead of manual zoom/pan. */
  fitGolfer?: boolean;
  /** Kept when looping is switched off so it can be switched back on. */
  loop?: LoopRange;
  loopEnabled?: boolean;
  /** Show the pose skeleton (once the clip has been analyzed). */
  poseVisible?: boolean;
  /** "<videoId>@<detection version>" once that clip's detected positions were added. */
  autoPositionsFor?: string;
  /** Show the Swing checks panel. */
  swingCheck?: boolean;
  /** Which swing checks are switched on (unset ones use their default). */
  checks?: Partial<Record<SwingCheckId, boolean>>;
  /** Corner of the video the Swing checks panel sits in (default top-left). */
  checksCorner?: PanelCorner;
}

export type PanelCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type SwingCheckId = "tempo" | "head" | "posture" | "extension" | "leadArm";

export type AnnotationGeometry =
  | {
      kind: "line" | "arrow" | "plane";
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
  /** Clip the marker was placed on; it only applies while that clip is in the pane. */
  videoId?: string;
  label: string;
  time: number;
  notes?: string;
  /** "pose": placed by swing-position detection rather than by hand. */
  source?: "pose";
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
