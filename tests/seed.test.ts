import { describe, expect, it } from "vitest";
import { sampleSessions, sampleVideos } from "@/lib/data/seed";
import { sessionSchema, videoSchema } from "@/lib/validation";

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
});
