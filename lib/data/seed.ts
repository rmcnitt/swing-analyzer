import type { AnalysisSession, PaneId, SnapshotMarker, VideoAsset } from "@/lib/types";

// Bundled sample content so first-time visitors can try the workspace without uploading.
// Sample clips live in public/samples/ (compressed with scripts/prepare-sample.sh).
const seededAt = "2026-11-02T12:00:00.000Z";

const sampleVideoBase = {
  ownerId: "sample",
  ownerName: "Sample",
  sourceType: "user",
  width: 720,
  height: 1280,
  fps: 60,
  clubTag: "7 Iron",
  uploadStatus: "ready",
  createdAt: seededAt,
} satisfies Partial<VideoAsset>;

export const sampleVideos: VideoAsset[] = [
  {
    ...sampleVideoBase,
    id: "sample-video-face-on",
    title: "Sample swing (face-on)",
    description: "Bundled sample clip for trying the analysis tools.",
    url: "/samples/sample-face-on.mp4",
    thumbnailUrl: "/samples/sample-face-on.jpg",
    duration: 4.39,
    orientation: "face-on",
  },
  {
    ...sampleVideoBase,
    id: "sample-video-down-the-line",
    title: "Sample swing (down-the-line)",
    description: "Bundled sample clip for trying the analysis tools.",
    url: "/samples/sample-down-the-line.mp4",
    thumbnailUrl: "/samples/sample-down-the-line.jpg",
    duration: 5.58,
    orientation: "down-the-line",
  },
];

function positionMarkers(
  sessionKey: string,
  paneId: PaneId,
  times: Record<"Address" | "Takeaway" | "Top" | "Impact" | "Finish", number>,
): SnapshotMarker[] {
  return Object.entries(times).map(([label, time]) => ({
    id: `${sessionKey}-marker-${label.toLowerCase()}`,
    paneId,
    label,
    time,
  }));
}

function samplePanes(videoId: string): AnalysisSession["panes"] {
  return [
    {
      id: "primary",
      label: "My swing",
      videoId,
      overlayVisible: true,
      playbackRate: 0.25,
      currentTime: 0,
    },
    {
      id: "secondary",
      label: "Comparison",
      overlayVisible: true,
      playbackRate: 0.25,
      currentTime: 0,
    },
  ];
}

export const sampleSessions: AnalysisSession[] = [
  {
    id: "sample-session",
    userId: "sample",
    title: "Sample: face-on 7 iron",
    primaryVideoId: "sample-video-face-on",
    syncEnabled: false,
    playbackDefaults: { speed: 0.25 },
    notes:
      "Sample session. Click a marker to jump to that position, step frame by frame, and try the drawing tools. The circle tracks head position at address.",
    lastOpenedAt: seededAt,
    panes: samplePanes("sample-video-face-on"),
    annotations: {
      primary: [
        {
          id: "sample-session-head-circle",
          paneId: "primary",
          type: "circle",
          geometry: { kind: "circle", center: { x: 0.49, y: 0.27 }, radius: 0.07 },
          style: { stroke: "#f97316", strokeWidth: 3, opacity: 1 },
          label: "Head position",
          zIndex: 1,
        },
      ],
      secondary: [],
    },
    snapshotMarkers: positionMarkers("sample-session", "primary", {
      Address: 1.5,
      Takeaway: 1.85,
      Top: 2.48,
      Impact: 2.75,
      Finish: 3.75,
    }),
  },
  {
    id: "sample-session-dtl",
    userId: "sample",
    title: "Sample: down-the-line 7 iron",
    primaryVideoId: "sample-video-down-the-line",
    syncEnabled: false,
    playbackDefaults: { speed: 0.25 },
    notes: "Sample session. Try the angle tool on the spine at address, then step to Top and compare.",
    lastOpenedAt: "2026-11-02T11:00:00.000Z",
    panes: samplePanes("sample-video-down-the-line"),
    annotations: { primary: [], secondary: [] },
    snapshotMarkers: positionMarkers("sample-session-dtl", "primary", {
      Address: 1.0,
      Takeaway: 1.35,
      Top: 1.82,
      Impact: 2.05,
      Finish: 3.0,
    }),
  },
];

export function getSampleSession(sessionId: string) {
  return sampleSessions.find((session) => session.id === sessionId) ?? null;
}
