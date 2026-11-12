import { describe, expect, it } from "vitest";
import { unrotatePoint, unrotateRect } from "@/lib/analysis/screen-rotation";
import { workspaceLayout } from "@/lib/analysis/workspace-layout";

describe("workspaceLayout", () => {
  it("keeps desktop and iPad on the desktop layout", () => {
    expect(workspaceLayout({ smallScreen: false, portrait: true, compareMode: true })).toEqual({
      layout: "desktop",
      rotated: false,
    });
  });

  it("uses the scrolling phone layout for one swing held upright", () => {
    expect(workspaceLayout({ smallScreen: true, portrait: true, compareMode: false })).toEqual({
      layout: "phone",
      rotated: false,
    });
  });

  it("never stacks compare on a phone: upright turns the screen sideways", () => {
    expect(workspaceLayout({ smallScreen: true, portrait: true, compareMode: true })).toEqual({
      layout: "compact",
      rotated: true,
    });
  });

  it("uses compact without turning when the phone is already landscape", () => {
    expect(workspaceLayout({ smallScreen: true, portrait: false, compareMode: true })).toEqual({
      layout: "compact",
      rotated: false,
    });
    expect(workspaceLayout({ smallScreen: true, portrait: false, compareMode: false }).layout).toBe("compact");
  });
});

describe("screen rotation mapping", () => {
  // A 390×844 phone; the layout is 844 wide × 390 tall, drawn turned 90° clockwise.
  const vw = 390;

  it("maps the screen's corners back to the layout's", () => {
    // Layout top-left is drawn at the screen's top-right.
    expect(unrotatePoint({ x: 390, y: 0 }, vw)).toEqual({ x: 0, y: 0 });
    // Layout top-right (844, 0) is at the screen's bottom-right.
    expect(unrotatePoint({ x: 390, y: 844 }, vw)).toEqual({ x: 844, y: 0 });
    // Layout bottom-left (0, 390) is at the screen's top-left.
    expect(unrotatePoint({ x: 0, y: 0 }, vw)).toEqual({ x: 0, y: 390 });
  });

  it("maps a bounding box back so relative positions inside it hold", () => {
    // A layout box at (100, 50), 200 wide × 80 tall, as the browser reports it on screen.
    const screen = { left: vw - 50 - 80, top: 100, right: vw - 50, bottom: 300 };
    const rect = unrotateRect(screen, vw);
    expect(rect).toEqual({ left: 100, top: 50, width: 200, height: 80 });

    // A tap a quarter of the way along the box's layout width, at mid height.
    const point = unrotatePoint({ x: vw - 50 - 40, y: 150 }, vw);
    expect((point.x - rect.left) / rect.width).toBeCloseTo(0.25);
    expect((point.y - rect.top) / rect.height).toBeCloseTo(0.5);
  });
});
