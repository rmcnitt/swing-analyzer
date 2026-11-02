import { describe, expect, it } from "vitest";
import { clientToStagePoint, isDegenerateShape } from "@/lib/analysis/annotations";

const stage = { width: 400, height: 300 };

describe("clientToStagePoint", () => {
  it("maps directly at 100% zoom", () => {
    expect(clientToStagePoint({ x: 150, y: 120 }, { left: 50, top: 20, ...stage }, stage)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("undoes CSS zoom and pan", () => {
    // 2x zoom about the centre, panned 30px right: rendered rect is 800x600 at (-170, -150).
    const rect = { left: -170, top: -150, width: 800, height: 600 };

    // Stage centre stays under the (panned) centre of the viewport.
    expect(clientToStagePoint({ x: 230, y: 150 }, rect, stage)).toEqual({ x: 200, y: 150 });
    expect(clientToStagePoint({ x: -170, y: -150 }, rect, stage)).toEqual({ x: 0, y: 0 });
  });

  it("returns null before layout", () => {
    expect(clientToStagePoint({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 }, stage)).toBeNull();
  });
});

describe("isDegenerateShape", () => {
  it("rejects click-sized lines and accepts real drags", () => {
    expect(isDegenerateShape({ kind: "line", points: [{ x: 10, y: 10 }, { x: 11, y: 12 }] })).toBe(true);
    expect(isDegenerateShape({ kind: "arrow", points: [{ x: 10, y: 10 }, { x: 40, y: 10 }] })).toBe(false);
  });

  it("rejects flat rectangles and tiny circles", () => {
    expect(
      isDegenerateShape({ kind: "rectangle", origin: { x: 0, y: 0 }, size: { width: 50, height: 1 } }),
    ).toBe(true);
    expect(isDegenerateShape({ kind: "circle", center: { x: 5, y: 5 }, radius: 2 })).toBe(true);
  });

  it("measures freehand by path length", () => {
    expect(
      isDegenerateShape({ kind: "freehand", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }),
    ).toBe(true);
    expect(
      isDegenerateShape({ kind: "freehand", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }] }),
    ).toBe(false);
  });
});
