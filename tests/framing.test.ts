import { describe, expect, it } from "vitest";
import { clampPan, fitFraming, rectFromPoints, coverFraming } from "@/lib/analysis/framing";

const stage = { width: 400, height: 800 };

describe("fitFraming", () => {
  it("zooms so the golfer fills the viewport height and centres them", () => {
    // Golfer occupies the middle half of the frame height, slightly left of centre.
    const { zoom, pan } = fitFraming({ x: 0.3, y: 0.3, width: 0.3, height: 0.5 }, stage, stage, 0.9);

    expect(zoom).toBeCloseTo(1.8);
    // Box centre is 0.05 * 400 = 20px left and 0.05 * 800 = 40px below the stage centre.
    expect(pan.x).toBeCloseTo(20 * 1.8);
    expect(pan.y).toBeCloseTo(-40 * 1.8);
  });

  it("gives two differently-sized golfers the same on-screen height", () => {
    const viewport = { width: 600, height: 800 };
    const near = { x: 0.2, y: 0.1, width: 0.5, height: 0.8 };
    const far = { x: 0.4, y: 0.4, width: 0.2, height: 0.4 };

    const nearFit = fitFraming(near, stage, viewport);
    const farFit = fitFraming(far, stage, viewport);

    expect(near.height * stage.height * nearFit.zoom).toBeCloseTo(
      far.height * stage.height * farFit.zoom,
    );
  });

  it("respects the zoom range and keeps the stage covering itself", () => {
    const tiny = fitFraming({ x: 0.9, y: 0.9, width: 0.05, height: 0.05 }, stage, stage);
    expect(tiny.zoom).toBe(4);
    expect(tiny.pan).toEqual(clampPan(tiny.pan, stage, 4));

    expect(fitFraming({ x: 0, y: 0, width: 1, height: 1 }, stage, stage).zoom).toBe(1);
  });
});

describe("coverFraming", () => {
  // A 9:16 clip contained in a 440×520 hero: the stage is 292.5×520.
  const stage = { width: 292.5, height: 520 };
  const viewport = { width: 440, height: 520 };
  const crop = { x: 0.06, y: 0.25, width: 0.7, height: 0.53 };

  it("fills the viewport and shows no more than the crop's width", () => {
    const { zoom } = coverFraming(crop, stage, viewport);
    expect(stage.width * zoom).toBeGreaterThanOrEqual(viewport.width);
    expect(stage.height * zoom).toBeGreaterThanOrEqual(viewport.height);
    expect(viewport.width / (stage.width * zoom)).toBeCloseTo(0.7, 3);
  });

  it("never pans an edge of the video into view", () => {
    const { zoom, pan } = coverFraming({ x: 0, y: 0, width: 0.5, height: 0.2 }, stage, viewport);
    expect(Math.abs(pan.x)).toBeLessThanOrEqual((stage.width * zoom - viewport.width) / 2 + 1e-6);
    expect(Math.abs(pan.y)).toBeLessThanOrEqual((stage.height * zoom - viewport.height) / 2 + 1e-6);
  });

  it("centres on the crop when there's room", () => {
    const { zoom, pan } = coverFraming(crop, stage, viewport);
    expect(pan.x).toBeCloseTo(-(0.41 - 0.5) * stage.width * zoom, 2);
  });
});

describe("rectFromPoints", () => {
  it("normalizes drag direction and clips to the frame", () => {
    const rect = rectFromPoints({ x: 0.8, y: 1.2 }, { x: 0.2, y: 0.3 });

    expect(rect.x).toBeCloseTo(0.2);
    expect(rect.y).toBeCloseTo(0.3);
    expect(rect.width).toBeCloseTo(0.6);
    expect(rect.height).toBeCloseTo(0.7);
  });
});
