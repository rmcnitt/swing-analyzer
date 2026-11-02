import { describe, expect, it } from "vitest";
import { sampleSessions, sampleVideos } from "@/lib/data/seed";
import { planVideoDeletion, videosOrphanedBySessionDelete } from "@/lib/storage/library-cleanup";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

const reference: VideoAsset = { ...sampleVideos[1], id: "ref-1", sourceType: "reference" };
const swing: VideoAsset = { ...sampleVideos[0], id: "swing-1", sourceType: "user" };

function session(id: string, primaryVideoId: string, secondaryVideoId?: string): AnalysisSession {
  const base = sampleSessions[0];
  return {
    ...base,
    id,
    primaryVideoId,
    secondaryVideoId,
    panes: [
      { ...base.panes[0], videoId: primaryVideoId },
      { ...base.panes[1], videoId: secondaryVideoId, label: secondaryVideoId ? "Ref" : "Comparison" },
    ],
  };
}

describe("videosOrphanedBySessionDelete", () => {
  it("removes the session's own swing but keeps references", () => {
    const deleted = session("s1", "swing-1", "ref-1");

    expect(videosOrphanedBySessionDelete(deleted, [deleted], [swing, reference])).toEqual(["swing-1"]);
  });

  it("keeps a swing another session still uses", () => {
    const deleted = session("s1", "swing-1");
    const other = session("s2", "other", "swing-1");

    expect(videosOrphanedBySessionDelete(deleted, [deleted, other], [swing, reference])).toEqual([]);
  });
});

describe("planVideoDeletion", () => {
  it("deletes sessions built on the video and clears it from compare panes", () => {
    const own = session("s1", "swing-1");
    const comparing = session("s2", "other", "swing-1");
    const unrelated = session("s3", "other");

    const plan = planVideoDeletion("swing-1", [own, comparing, unrelated]);

    expect(plan.deleteSessionIds).toEqual(["s1"]);
    expect(plan.updatedSessions).toHaveLength(1);
    expect(plan.updatedSessions[0].id).toBe("s2");
    expect(plan.updatedSessions[0].secondaryVideoId).toBeUndefined();
    expect(plan.updatedSessions[0].panes[1].videoId).toBeUndefined();
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [52 * 1024 * 1024, "52 MB"],
    [2.25 * 1024 ** 3, "2.3 GB"],
  ])("formats %d as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
