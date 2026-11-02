import { describe, expect, it } from "vitest";
import {
  angleBetween,
  extendLineToFrame,
  moveHandle,
  shapeHandles,
  translateGeometry,
} from "@/lib/analysis/shape-edit";
import type { Point } from "@/lib/types";

const stage = { width: 400, height: 300 };

describe("shapeHandles / moveHandle", () => {
  it("drags a line endpoint", () => {
    const line = { kind: "line" as const, points: [{ x: 10, y: 10 }, { x: 100, y: 10 }] as [Point, Point] };

    expect(moveHandle(line, 1, { x: 50, y: 80 })).toEqual({
      kind: "line",
      points: [{ x: 10, y: 10 }, { x: 50, y: 80 }],
    });
  });

  it("resizes a box from a corner, keeping the opposite corner fixed (and flipping past it)", () => {
    const box = { kind: "rectangle" as const, origin: { x: 100, y: 100 }, size: { width: 50, height: 40 } };

    expect(shapeHandles(box)[2]).toEqual({ x: 150, y: 140 });
    expect(moveHandle(box, 2, { x: 200, y: 160 })).toEqual({
      kind: "rectangle",
      origin: { x: 100, y: 100 },
      size: { width: 100, height: 60 },
    });
    expect(moveHandle(box, 2, { x: 80, y: 90 })).toEqual({
      kind: "rectangle",
      origin: { x: 80, y: 90 },
      size: { width: 20, height: 10 },
    });
  });

  it("sets a circle's radius from its handle", () => {
    const circle = { kind: "circle" as const, center: { x: 50, y: 50 }, radius: 10 };

    expect(shapeHandles(circle)).toEqual([{ x: 60, y: 50 }]);
    expect(moveHandle(circle, 0, { x: 50, y: 80 })).toEqual({ ...circle, radius: 30 });
  });
});

describe("translateGeometry", () => {
  it("moves every point by the delta", () => {
    const angle = {
      kind: "angle" as const,
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 10 }] as [Point, Point, Point],
    };

    expect(translateGeometry(angle, { x: 5, y: 7 }, stage)).toEqual({
      kind: "angle",
      points: [{ x: 15, y: 17 }, { x: 25, y: 27 }, { x: 35, y: 17 }],
    });
  });

  it("stops at the frame edge without distorting the shape", () => {
    const box = { kind: "rectangle" as const, origin: { x: 350, y: 10 }, size: { width: 40, height: 20 } };

    expect(translateGeometry(box, { x: 100, y: -50 }, stage)).toEqual({
      kind: "rectangle",
      origin: { x: 360, y: 0 },
      size: { width: 40, height: 20 },
    });
  });
});

describe("extendLineToFrame", () => {
  it("runs a diagonal from edge to edge", () => {
    const [a, b] = extendLineToFrame({ x: 100, y: 100 }, { x: 200, y: 200 }, stage);

    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(0);
    expect(b.x).toBeCloseTo(300);
    expect(b.y).toBeCloseTo(300);
  });

  it("handles vertical lines", () => {
    expect(extendLineToFrame({ x: 50, y: 100 }, { x: 50, y: 120 }, stage)).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 300 },
    ]);
  });

  it("returns the points unchanged when they coincide", () => {
    const p = { x: 5, y: 5 };
    expect(extendLineToFrame(p, p, stage)).toEqual([p, p]);
  });
});

describe("angleBetween", () => {
  it("measures the interior angle at the middle point", () => {
    expect(angleBetween({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0);
  });
});
