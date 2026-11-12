import { describe, expect, it } from "vitest";
import { sampleSessions, sampleVideos } from "@/lib/data/seed";
import { frameIndexAt } from "@/lib/analysis/frames";
import { cleanTrack } from "@/lib/pose/clean-track";
import { detectSwingPositions } from "@/lib/pose/swing-positions";
import { sessionSchema, videoSchema } from "@/lib/validation";
import { loadPoseFixture } from "@/tests/helpers/pose-fixtures";

describe("sample seed data", () => {
  it("passes the same validation used when loading from IndexedDB", () => {
    for (const session of sampleSessions) {
      expect(() => sessionSchema.parse(session)).not.toThrow();
    }

    for (const video of sampleVideos) {
      expect(() => videoSchema.parse(video)).not.toThrow();
    }
  });

  it("only references bundled sample videos", () => {
    const videoIds = new Set(sampleVideos.map((video) => video.id));

    for (const session of sampleSessions) {
      expect(videoIds.has(session.primaryVideoId)).toBe(true);
    }
  });

  it("puts the down-the-line sample's Impact on the impact frame", () => {
    // Frame 125 is the clubhead on the ball (checked by eye); the detector agrees.
    const marker = sampleSessions
      .find((session) => session.id === "sample-session-dtl")!
      .snapshotMarkers.find((m) => m.label === "Impact")!;
    const detected = detectSwingPositions(cleanTrack(loadPoseFixture("sample-video-down-the-line")), 720 / 1280)!;

    expect(frameIndexAt(marker.time, 60)).toBe(125);
    expect(frameIndexAt(detected.Impact ?? -1, 60)).toBe(125);
  });
});
