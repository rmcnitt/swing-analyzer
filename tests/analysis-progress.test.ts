import { describe, expect, it } from "vitest";
import { analysisProgressText, sampledFrameCount } from "@/lib/pose/analysis-progress";
import { sampleTimes } from "@/lib/pose/landmarks";

describe("analysis progress", () => {
  it("counts the same frames pose analysis samples", () => {
    for (const [duration, fps] of [
      [2.5, 60],
      [4.38, 59.94],
      [1, 30],
      [60, 60],
      [0.01, 30],
    ]) {
      expect(sampledFrameCount(duration, fps)).toBe(sampleTimes(duration, fps).length);
    }
  });

  it("reports frames, or a percentage without a duration", () => {
    expect(analysisProgressText(0.56, 2.5, 60)).toBe("Analyzing frame 84 / 150");
    expect(analysisProgressText(0.56)).toBe("Analyzing 56%");
  });
});
