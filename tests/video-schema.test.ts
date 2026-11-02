import { describe, expect, it } from "vitest";
import { sampleVideos } from "@/lib/data/seed";
import { videoSchema } from "@/lib/validation";

describe("videoSchema sourceType", () => {
  it.each([
    ["local", "user"],
    ["pro", "reference"],
    ["user", "user"],
    ["reference", "reference"],
  ])("maps stored %s to %s", (stored, expected) => {
    expect(videoSchema.parse({ ...sampleVideos[0], sourceType: stored }).sourceType).toBe(expected);
  });
});
