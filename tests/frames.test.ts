import { describe, expect, it } from "vitest";
import {
  estimateFpsFromMediaTimes,
  frameIndexAt,
  snapFrameRate,
  stepFrameTime,
} from "@/lib/analysis/frames";

const times = (fps: number, frameIndices: number[]) => frameIndices.map((index) => index / fps);

describe("snapFrameRate", () => {
  it("snaps near-standard rates and leaves odd ones", () => {
    expect(snapFrameRate(60.4)).toBe(60);
    expect(snapFrameRate(59.7)).toBe(59.94);
    expect(snapFrameRate(29.95)).toBe(29.97);
    expect(snapFrameRate(238.4)).toBe(240);
    expect(snapFrameRate(75.3)).toBe(75.3);
  });
});

describe("estimateFpsFromMediaTimes", () => {
  it("measures consecutive frames", () => {
    expect(estimateFpsFromMediaTimes(times(30, [0, 1, 2, 3, 4, 5, 6]))).toBe(30);
  });

  it("finds the frame duration when the display skips frames", () => {
    // 120fps clip on a display that mostly shows every second frame.
    expect(estimateFpsFromMediaTimes(times(120, [0, 2, 3, 5, 7, 8, 10, 11, 13, 15, 16]))).toBe(120);
  });

  it("returns null without enough samples", () => {
    expect(estimateFpsFromMediaTimes([0, 0.033])).toBeNull();
  });
});

describe("stepFrameTime", () => {
  it("steps to the centre of the next frame", () => {
    expect(stepFrameTime(0, 60, 1, 5)).toBeCloseTo(1.5 / 60);
    expect(frameIndexAt(stepFrameTime(0, 60, 1, 5), 60)).toBe(1);
  });

  it("is stable across repeated steps (no float drift)", () => {
    let time = 0;
    for (let step = 0; step < 90; step += 1) {
      time = stepFrameTime(time, 30, 1, 10);
    }
    expect(frameIndexAt(time, 30)).toBe(90);
  });

  it("treats a time exactly on a frame boundary as that frame", () => {
    expect(frameIndexAt(3 / 30, 30)).toBe(3);
    expect(frameIndexAt(stepFrameTime(3 / 30, 30, -1, 10), 30)).toBe(2);
  });

  it("clamps to the first and last frame", () => {
    expect(stepFrameTime(0, 30, -1, 2)).toBeCloseTo(0.5 / 30);
    expect(frameIndexAt(stepFrameTime(1.99, 30, 10, 2), 30)).toBe(59);
  });

  it("falls back to the default rate when fps is unknown", () => {
    expect(stepFrameTime(0, undefined, 1, 5)).toBeCloseTo(1.5 / 60);
  });
});
