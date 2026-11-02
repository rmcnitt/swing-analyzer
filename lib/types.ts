export type PaneId = "primary" | "secondary";

export type SwingOrientation = "face-on" | "down-the-line";
export type UploadStatus = "ready" | "processing";
export type VideoSourceType = "user" | "pro" | "local";
export type Handedness = "right" | "left";
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

export interface ProSwingReference {
  id: string;
  player: string;
  title: string;
  club: string;
  viewAngle: SwingOrientation;
  handedness: Handedness;
  fps: number;
  duration: number;
  tags: string[];
  videoUrl: string;
  thumbnailUrl: string;
}

export interface ProSwing {
  id: string;
  golferName: string;
  handedness: Handedness;
  clubType: string;
  tags: string[];
  publishStatus: "draft" | "published";
  orientation: SwingOrientation;
  videoAsset: VideoAsset;
}

export interface AppPreferences {
  activeTool?: AnnotationTool;
  activeColor?: HexColor;
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
  selectedProSwingId?: string;
}

export interface DashboardData {
  userName: string;
  videos: VideoAsset[];
  sessions: AnalysisSession[];
  proSwings: ProSwingReference[];
}
