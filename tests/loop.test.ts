import { describe, expect, it } from "vitest";
import { defaultLoop, loopStartFor, setLoopPoint } from "@/lib/analysis/loop";

describe("setLoopPoint", () => {
  it("starts a new range from the clip edges", () => {
    expect(setLoopPoint(undefined, "start", 1.2, 4)).toEqual({ start: 1.2, end: 4 });
    expect(setLoopPoint(undefined, "end", 3, 4)).toEqual({ start: 0, end: 3 });
  });

  it("moves one point and keeps the other", () => {
    expect(setLoopPoint({ start: 1, end: 3 }, "end", 2.5, 4)).toEqual({ start: 1, end: 2.5 });
    expect(setLoopPoint({ start: 1, end: 3 }, "start", 1.5, 4)).toEqual({ start: 1.5, end: 3 });
  });

  it("restarts the range when a point crosses the other", () => {
    expect(setLoopPoint({ start: 1, end: 2 }, "start", 3, 4)).toEqual({ start: 3, end: 4 });
    expect(setLoopPoint({ start: 2, end: 3 }, "end", 1, 4)).toEqual({ start: 0, end: 1 });
  });

  it("clamps to the clip", () => {
    expect(setLoopPoint({ start: 1, end: 3 }, "end", 9, 4)).toEqual({ start: 1, end: 4 });
  });
});

describe("defaultLoop", () => {
  it("spans Address to Finish when both are marked", () => {
    expect(defaultLoop(new Map([["address", 1.5], ["finish", 3.75]]), 5)).toEqual({ start: 1.5, end: 3.75 });
  });

  it("falls back to the whole clip", () => {
    expect(defaultLoop(new Map([["address", 1.5]]), 5)).toEqual({ start: 0, end: 5 });
  });
});

describe("loopStartFor", () => {
  it("restarts from the in point only when outside the range", () => {
    expect(loopStartFor({ start: 1, end: 2 }, 1.5)).toBe(1.5);
    expect(loopStartFor({ start: 1, end: 2 }, 0.5)).toBe(1);
    expect(loopStartFor({ start: 1, end: 2 }, 2)).toBe(1);
  });
});
