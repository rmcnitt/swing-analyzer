import type { AnalysisSession, DashboardData, ProSwing, VideoAsset } from "@/lib/types";
import { proSwingReferences } from "@/lib/data/pro-swings";

const now = new Date("2026-04-03T14:00:00.000Z").toISOString();

export const mockVideos: VideoAsset[] = [
  {
    id: "video-user-driver",
    title: "Driver swing, April range session",
    description: "Face-on view focused on shoulder turn and shaft lean.",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    width: 960,
    height: 540,
    ownerId: "user-demo",
    ownerName: "Robbie",
    sourceType: "user",
    duration: 8,
    fps: 120,
    orientation: "face-on",
    clubTag: "Driver",
    uploadStatus: "ready",
    createdAt: now,
  },
  {
    id: "video-user-iron",
    title: "7-iron down-the-line",
    description: "Down-the-line swing working on trail arm depth.",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    width: 640,
    height: 360,
    ownerId: "user-demo",
    ownerName: "Robbie",
    sourceType: "user",
    duration: 10,
    fps: 60,
    orientation: "down-the-line",
    clubTag: "7 Iron",
    uploadStatus: "ready",
    createdAt: now,
  },
];

export const mockProSwings: ProSwing[] = [
  {
    id: "pro-rory-driver",
    golferName: "Rory McIlroy",
    handedness: "right",
    clubType: "Driver",
    tags: ["tempo", "x-factor", "face-on"],
    publishStatus: "published",
    orientation: "face-on",
    videoAsset: {
      id: "video-pro-rory-driver",
      title: "Rory McIlroy Driver",
      description: "Reference driver swing for hip rotation and extension.",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      width: 960,
      height: 540,
      ownerId: "pro-library",
      ownerName: "Tour Library",
      sourceType: "pro",
      duration: 8,
      fps: 120,
      orientation: "face-on",
      clubTag: "Driver",
      uploadStatus: "ready",
      createdAt: now,
    },
  },
  {
    id: "pro-nelly-iron",
    golferName: "Nelly Korda",
    handedness: "right",
    clubType: "7 Iron",
    tags: ["sequence", "balance", "down-the-line"],
    publishStatus: "published",
    orientation: "down-the-line",
    videoAsset: {
      id: "video-pro-nelly-iron",
      title: "Nelly Korda 7 Iron",
      description: "Reference iron swing for width and delivery.",
      url: "https://www.w3schools.com/html/mov_bbb.mp4",
      width: 640,
      height: 360,
      ownerId: "pro-library",
      ownerName: "Tour Library",
      sourceType: "pro",
      duration: 10,
      fps: 60,
      orientation: "down-the-line",
      clubTag: "7 Iron",
      uploadStatus: "ready",
      createdAt: now,
    },
  },
];

export const mockSessions: AnalysisSession[] = [
  {
    id: "session-driver-checkpoint",
    userId: "user-demo",
    title: "Driver checkpoint compare",
    primaryVideoId: "video-user-driver",
    secondaryVideoId: "video-pro-rory-driver",
    syncEnabled: true,
    playbackDefaults: {
      speed: 0.25,
    },
    notes:
      "Watch lead arm structure from takeaway to P3. Compare hip depth and head stability at impact.",
    lastOpenedAt: now,
    panes: [
      {
        id: "primary",
        label: "My swing",
        videoId: "video-user-driver",
        overlayVisible: true,
        playbackRate: 0.25,
        currentTime: 0,
      },
      {
        id: "secondary",
        label: "Pro compare",
        videoId: "video-pro-rory-driver",
        overlayVisible: true,
        playbackRate: 0.25,
        currentTime: 0,
      },
    ],
    annotations: {
      primary: [
        {
          id: "annotation-primary-spine",
          paneId: "primary",
          type: "line",
          geometry: {
            kind: "line",
            points: [
              { x: 0.48, y: 0.18 },
              { x: 0.44, y: 0.82 },
            ],
          },
          style: {
            stroke: "#f97316",
            strokeWidth: 3,
            opacity: 1,
          },
          label: "Spine angle",
          zIndex: 1,
        },
      ],
      secondary: [],
    },
    snapshotMarkers: [
      {
        id: "snapshot-top",
        paneId: "primary",
        label: "Top of backswing",
        time: 1.3,
      },
      {
        id: "snapshot-impact",
        paneId: "primary",
        label: "Impact",
        time: 2.05,
      },
    ],
    selectedProSwingId: "pro-rory-driver",
  },
  {
    id: "session-iron-baseline",
    userId: "user-demo",
    title: "7-iron baseline",
    primaryVideoId: "video-user-iron",
    syncEnabled: false,
    playbackDefaults: {
      speed: 0.5,
    },
    notes: "Review hand path and balance through finish.",
    lastOpenedAt: now,
    panes: [
      {
        id: "primary",
        label: "My swing",
        videoId: "video-user-iron",
        overlayVisible: true,
        playbackRate: 0.5,
        currentTime: 0,
      },
      {
        id: "secondary",
        label: "Comparison",
        overlayVisible: true,
        playbackRate: 0.5,
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

export const mockDashboard: DashboardData = {
  userName: "Robbie",
  videos: mockVideos,
  sessions: mockSessions,
  proSwings: proSwingReferences,
};
