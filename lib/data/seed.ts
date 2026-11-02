import type { AnalysisSession, VideoAsset } from "@/lib/types";

// Bundled sample content so first-time visitors can try the workspace without uploading.
// Sample clips live in public/samples/ (compressed H.264, see scripts/prepare-sample.sh).
const seededAt = "2026-11-02T12:00:00.000Z";

export const sampleVideos: VideoAsset[] = [
  {
    id: "sample-video-face-on",
    title: "Sample swing (face-on)",
    description: "Bundled sample clip for trying the analysis tools.",
    url: "/samples/sample-face-on.mp4",
    thumbnailUrl: "/samples/sample-face-on.jpg",
    ownerId: "sample",
    ownerName: "Sample",
    sourceType: "user",
    duration: 0,
    orientation: "face-on",
    clubTag: "7 Iron",
    uploadStatus: "ready",
    createdAt: seededAt,
  },
];

export const sampleSessions: AnalysisSession[] = [
  {
    id: "sample-session",
    userId: "sample",
    title: "Sample swing review",
    primaryVideoId: "sample-video-face-on",
    syncEnabled: false,
    playbackDefaults: {
      speed: 0.25,
    },
    notes: "Sample session. Try stepping frame by frame, drawing a spine-angle line, and adding markers.",
    lastOpenedAt: seededAt,
    panes: [
      {
        id: "primary",
        label: "My swing",
        videoId: "sample-video-face-on",
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
    ],
    annotations: {
      primary: [],
      secondary: [],
    },
    snapshotMarkers: [],
  },
];

export function getSampleSession(sessionId: string) {
  return sampleSessions.find((session) => session.id === sessionId) ?? null;
}
