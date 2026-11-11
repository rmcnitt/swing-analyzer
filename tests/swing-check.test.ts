import { describe, expect, it } from "vitest";
import { cleanTrack } from "@/lib/pose/clean-track";
import {
  FRAME_STRIDE,
  frameIndexNear,
  LANDMARK_COUNT,
  LM,
  POSE_TRACK_VERSION,
  writeFrame,
  type PoseTrack,
} from "@/lib/pose/landmarks";
import {
  AVERAGE_HEIGHT_INCHES,
  buildCheckGuides,
  clampHeight,
  describeHeadShift,
  detectCameraView,
  formatHeight,
  headMovement,
  headSource,
  headWithinTolerance,
  inchesPerUnit,
  isCheckOn,
  swingTempo,
} from "@/lib/pose/swing-check";
import { detectSwingPhases } from "@/lib/pose/swing-positions";
import { loadPoseFixture } from "@/tests/helpers/pose-fixtures";

const PORTRAIT = 720 / 1280;

function sample(name: "sample-video-face-on" | "sample-video-down-the-line") {
  const track = cleanTrack(loadPoseFixture(name));
  return { track, phases: detectSwingPhases(track, PORTRAIT)! };
}

describe("swingTempo", () => {
  it("measures backswing against downswing", () => {
    expect(swingTempo({ start: 1, top: 1.9, impact: 2.2 })).toEqual({
      backswing: expect.closeTo(0.9, 5),
      downswing: expect.closeTo(0.3, 5),
      ratio: expect.closeTo(3, 5),
    });
  });

  it("needs all three times, in order", () => {
    expect(swingTempo({ top: 1.9, impact: 2.2 })).toBeNull();
    expect(swingTempo({ start: 2, top: 1.9, impact: 2.2 })).toBeNull();
    expect(swingTempo({ start: 1, top: 2.3, impact: 2.2 })).toBeNull();
  });

  it("gives the sample swings a plausible tempo", () => {
    for (const name of ["sample-video-face-on", "sample-video-down-the-line"] as const) {
      const { phases } = sample(name);
      const tempo = swingTempo({ start: phases.motionStart, top: phases.Top, impact: phases.Impact })!;

      expect(tempo.ratio).toBeGreaterThan(1.5);
      expect(tempo.ratio).toBeLessThan(4.5);
    }

    const { phases } = sample("sample-video-face-on");
    expect(swingTempo({ start: phases.motionStart, top: phases.Top, impact: phases.Impact })!.ratio).toBeCloseTo(
      3,
      0,
    );
  });
});

describe("detectSwingPhases", () => {
  it("puts the motion start between Address and Top", () => {
    const { phases } = sample("sample-video-down-the-line");

    expect(phases.motionStart).toBeGreaterThan(phases.Address!);
    expect(phases.motionStart).toBeLessThan(phases.Top!);
  });
});

describe("camera view and head movement on the samples", () => {
  it("tells face-on from down-the-line", () => {
    for (const [name, view] of [
      ["sample-video-face-on", "face-on"],
      ["sample-video-down-the-line", "down-the-line"],
    ] as const) {
      const { track, phases } = sample(name);
      expect(detectCameraView(track, frameIndexNear(track, phases.Address!), PORTRAIT)).toBe(view);
    }
  });

  it("measures the face-on head dip seen in the frames", () => {
    const { track, phases } = sample("sample-video-face-on");
    const movement = headMovement(
      track,
      { address: phases.Address, top: phases.Top, impact: phases.Impact },
      PORTRAIT,
    )!;

    expect(movement.view).toBe("face-on");
    // The cap drops ~37 px of 1280 between address and impact.
    expect(movement.atImpact!.down).toBeGreaterThan(2.5);
    expect(movement.atImpact!.down).toBeLessThan(7);
    expect(Math.abs(movement.atTop!.forward)).toBeLessThan(3);
  });

  it("returns null without an address time", () => {
    const { track } = sample("sample-video-face-on");
    expect(headMovement(track, { top: 2.5 }, PORTRAIT)).toBeNull();
  });
});

function trackWithEars(earVisibility: number): PoseTrack {
  const times = [0.1, 0.2, 0.3];
  const data = new Float32Array(times.length * FRAME_STRIDE);

  times.forEach((_, index) => {
    const points = Array.from({ length: LANDMARK_COUNT }, (_, landmark) => ({
      x: 0.5,
      y: 0.5,
      visibility: landmark === LM.leftEar || landmark === LM.rightEar ? earVisibility : 0.9,
    }));
    writeFrame(data, index, points, points.map((point) => ({ ...point, z: 0 })));
  });

  return {
    version: POSE_TRACK_VERSION,
    videoId: "ears",
    model: "test",
    times,
    data,
    duration: 0.3,
    analyzedAt: "2026-11-10T00:00:00.000Z",
  };
}

describe("headSource", () => {
  it("uses the ears when both are visible, else the nose", () => {
    expect(headSource(trackWithEars(0.9), 0, 1)).toBe("ears");
    expect(headSource(trackWithEars(0.2), 0, 1)).toBe("nose");
  });
});

describe("describeHeadShift", () => {
  it("names directions for the view", () => {
    expect(describeHeadShift({ forward: 0.6, down: 1.1 }, "face-on")).toBe(
      "≈1.1 in down · 0.6 in toward target",
    );
    expect(describeHeadShift({ forward: -0.5, down: -0.3 }, "down-the-line")).toBe(
      "≈0.3 in up · 0.5 in away from ball",
    );
    expect(describeHeadShift({ forward: 0.4, down: 0 }, "unknown")).toBe("≈0.4 in right");
  });

  it("has a compact form for the panel", () => {
    expect(describeHeadShift({ forward: -0.8, down: 1.8 }, "face-on", { short: true })).toBe("1.8″ down · 0.8″ back");
    expect(describeHeadShift({ forward: 0.6, down: 0 }, "down-the-line", { short: true })).toBe("0.6″ to ball");
  });

  it("calls tiny movement steady", () => {
    expect(describeHeadShift({ forward: 0.1, down: -0.2 }, "face-on")).toBe("steady");
  });
});

describe("golfer height", () => {
  it("scales inches with the golfer's height", () => {
    const { track, phases } = sample("sample-video-face-on");
    const times = { address: phases.Address, top: phases.Top, impact: phases.Impact };
    const average = headMovement(track, times, PORTRAIT)!;
    const short = headMovement(track, times, PORTRAIT, { heightInches: AVERAGE_HEIGHT_INCHES / 2 })!;

    expect(short.atImpact!.down).toBeCloseTo(average.atImpact!.down / 2, 6);
    expect(short.atTop!.forward).toBeCloseTo(average.atTop!.forward / 2, 6);
  });

  it("measures about 33 inches of leg on an average golfer", () => {
    const { track, phases } = sample("sample-video-down-the-line");
    const index = frameIndexNear(track, phases.Address!);
    const perUnit = inchesPerUnit(track, index, PORTRAIT);

    expect(perUnit).toBeGreaterThan(0);
    expect(inchesPerUnit(track, index, PORTRAIT, 35)).toBeCloseTo(perUnit / 2, 6);
  });

  it("formats and clamps heights", () => {
    expect(formatHeight(70)).toBe(`5'10"`);
    expect(formatHeight(72)).toBe(`6'0"`);
    expect(clampHeight(20)).toBe(48);
    expect(clampHeight(71.6)).toBe(72);
    expect(clampHeight(200)).toBe(90);
  });
});

describe("check switches", () => {
  it("uses each check's default until it is set", () => {
    expect(isCheckOn(undefined, "tempo")).toBe(true);
    expect(isCheckOn(undefined, "head")).toBe(true);
    expect(isCheckOn({ head: false }, "head")).toBe(false);
    expect(isCheckOn({}, "posture")).toBe(false);
  });
});

describe("head tolerance", () => {
  it("flags a head that moved more than two inches", () => {
    const base = { view: "face-on" as const, source: "ears" as const };
    expect(headWithinTolerance({ ...base, atTop: { forward: 1, down: 1 } })).toBe(true);
    expect(headWithinTolerance({ ...base, atTop: { forward: 0.5, down: 0 }, atImpact: { forward: 0, down: 2.5 } })).toBe(
      false,
    );
  });
});

describe("buildCheckGuides", () => {
  it("rings the head at Address", () => {
    const { track, phases } = sample("sample-video-face-on");
    const guides = buildCheckGuides(
      track,
      { address: phases.Address, top: phases.Top, impact: phases.Impact },
      PORTRAIT,
    );

    expect(guides.head!.origin.y).toBeGreaterThan(0);
    expect(guides.head!.origin.y).toBeLessThan(0.5);
    // Roughly a head: 1–5% of the frame height in these portrait clips.
    expect(guides.head!.radius).toBeGreaterThan(0.01);
    expect(guides.head!.radius).toBeLessThan(0.05);
  });

  it("has nothing to draw without an address", () => {
    const { track, phases } = sample("sample-video-face-on");
    expect(buildCheckGuides(track, { top: phases.Top, impact: phases.Impact })).toEqual({});
  });
});
