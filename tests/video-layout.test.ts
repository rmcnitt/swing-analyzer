import { describe, expect, it } from "vitest";
import { getContainedStageSize, getVideoAspectRatio } from "@/lib/video-layout";

describe("video layout helpers", () => {
  it("falls back to 16:9 when intrinsic dimensions are missing", () => {
    expect(getVideoAspectRatio()).toBeCloseTo(16 / 9);
    expect(getVideoAspectRatio({ width: 0, height: 0 })).toBeCloseTo(16 / 9);
  });

  it("calculates a contained portrait stage inside a 16:9 viewport", () => {
    const size = getContainedStageSize(1280, 720, 9 / 16);

    expect(size.width).toBe(405);
    expect(size.height).toBe(720);
  });

  it("calculates a contained landscape stage without cropping", () => {
    const size = getContainedStageSize(800, 600, 16 / 9);

    expect(size.width).toBe(800);
    expect(size.height).toBe(450);
  });
});
