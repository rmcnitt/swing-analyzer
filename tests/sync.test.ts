import { describe, expect, it } from "vitest";
import { frameStepForFps, shouldSyncToLeader } from "@/lib/analysis/sync";

describe("sync helpers", () => {
  it("skips a seek when panes are already close", () => {
    const result = shouldSyncToLeader(1.25, 1.2, 0.06);

    expect(result.shouldSeek).toBe(false);
    expect(result.nextTime).toBe(1.2);
  });

  it("seeks when panes drift beyond the threshold", () => {
    const result = shouldSyncToLeader(1.25, 0.4, 0.06);

    expect(result.shouldSeek).toBe(true);
    expect(result.nextTime).toBe(1.25);
  });

  it("does not seek backward when panes are already nearly aligned", () => {
    const result = shouldSyncToLeader(2.004, 1.998, 0.01);

    expect(result.shouldSeek).toBe(false);
    expect(result.nextTime).toBe(1.998);
  });

  it("uses a default frame step when fps is unknown", () => {
    expect(frameStepForFps()).toBeCloseTo(1 / 120);
    expect(frameStepForFps(240)).toBeCloseTo(1 / 240);
  });
});
