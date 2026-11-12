import { describe, expect, it } from "vitest";
import { HERO_LOOP, heroFrame } from "@/lib/landing/hero-script";

describe("heroFrame", () => {
  it("starts each loop with nothing switched on and the cursor coming in", () => {
    expect(heroFrame(HERO_LOOP.start)).toEqual({
      pose: false,
      checks: false,
      cursor: { target: "enter", visible: true, clicking: false },
    });
  });

  it("clicks Pose, then Swing checks, in that order", () => {
    expect(heroFrame(0.5)).toMatchObject({ pose: false, cursor: { target: "pose", clicking: false } });
    expect(heroFrame(0.56)).toMatchObject({ pose: true, checks: false, cursor: { target: "pose", clicking: true } });
    expect(heroFrame(0.75)).toMatchObject({ pose: true, checks: false, cursor: { target: "checks" } });
    expect(heroFrame(0.86)).toMatchObject({ pose: true, checks: true, cursor: { clicking: true } });
  });

  it("lets the swing play out with both on and the cursor gone", () => {
    expect(heroFrame(2.0)).toEqual({
      pose: true,
      checks: true,
      cursor: { target: "checks", visible: false, clicking: false },
    });
  });

  it("holds everything on, without a cursor, for reduced motion", () => {
    expect(heroFrame(0.3, { reducedMotion: true })).toMatchObject({
      pose: true,
      checks: true,
      cursor: { visible: false },
    });
  });
});
