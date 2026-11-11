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
  earlyExtension,
  extensionArrow,
  headShiftArrows,
  extensionWithinTolerance,
  formatHeight,
  headMovement,
  headSource,
  headWithinTolerance,
  inchesPerUnit,
  isCheckOn,
  leadArmPlane,
  postureChange,
  postureCheck,
  postureWithinTolerance,
  spineAngle,
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
    const base = { view: "face-on" as const, source: "ears" as const, screenSign: 1 as const };
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
    expect(buildCheckGuides(track, { top: phases.Top, impact: phases.Impact })).toEqual({ aspect: 1 });
  });
});

type Points = Partial<Record<number, { x: number; y: number; visibility?: number }>>;

/** A track with one frame per entry; unlisted landmarks sit mid-frame, fully visible. */
function syntheticTrack(frames: Points[], spacing = 0.1): PoseTrack {
  const times = frames.map((_, index) => (index + 0.5) * spacing);
  const data = new Float32Array(times.length * FRAME_STRIDE);

  frames.forEach((frame, index) => {
    const points = Array.from({ length: LANDMARK_COUNT }, (_, landmark) => ({
      x: frame[landmark]?.x ?? 0.5,
      y: frame[landmark]?.y ?? 0.5,
      visibility: frame[landmark]?.visibility ?? 0.9,
    }));
    writeFrame(data, index, points, points.map((point) => ({ ...point, z: 0 })));
  });

  return {
    version: POSE_TRACK_VERSION,
    videoId: "synthetic",
    model: "test",
    times,
    data,
    duration: times.length * spacing,
    analyzedAt: "2026-11-10T00:00:00.000Z",
  };
}

/** Torso with hips at (hx, 0.6) and shoulders `dx` across and 0.2 up (frame-height units). */
function torso(hx: number, dx: number): Points {
  return {
    [LM.leftHip]: { x: hx, y: 0.6 },
    [LM.rightHip]: { x: hx, y: 0.6 },
    [LM.leftShoulder]: { x: hx + dx, y: 0.4 },
    [LM.rightShoulder]: { x: hx + dx, y: 0.4 },
  };
}

describe("spineAngle", () => {
  it("measures the hip-to-shoulder line above the ground", () => {
    const track = syntheticTrack([torso(0.4, 0.2), torso(0.4, 0), torso(0.6, -0.2), torso(0.4, 0.2 / Math.sqrt(3))]);

    expect(spineAngle(track, 0)).toBeCloseTo(45, 5);
    expect(spineAngle(track, 1)).toBeCloseTo(90, 5);
    // Leaning the other way (a left-hander) reads the same.
    expect(spineAngle(track, 2)).toBeCloseTo(45, 5);
    expect(spineAngle(track, 3)).toBeCloseTo(60, 4);
  });

  it("uses the frame's aspect for horizontal distances", () => {
    const track = syntheticTrack([torso(0.4, 0.2)]);
    // 0.2 across at aspect 0.5 is 0.1 frame-heights: atan(0.2 / 0.1).
    expect(spineAngle(track, 0, 0.5)).toBeCloseTo((Math.atan(2) * 180) / Math.PI, 5);
  });

  it("gives nothing when the torso isn't visible", () => {
    const hidden = { ...torso(0.4, 0.2), [LM.leftShoulder]: { x: 0.6, y: 0.4, visibility: 0.1 } };
    expect(spineAngle(syntheticTrack([hidden]), 0)).toBeUndefined();
  });
});

describe("postureCheck", () => {
  it("reads a plausible address spine angle on the down-the-line sample", () => {
    const { track, phases } = sample("sample-video-down-the-line");
    const result = postureCheck(track, { address: phases.Address, top: phases.Top, impact: phases.Impact }, PORTRAIT)!;

    expect(result.ok).toBe(true);
    const posture = result.ok ? result.value : {};
    // Checked against the frames: ~57° at Address, ~60° at Top, ~56° at Impact.
    expect(posture.address).toBeGreaterThan(50);
    expect(posture.address).toBeLessThan(64);
    expect(Math.abs(posture.top! - posture.address!)).toBeLessThan(8);
    expect(Math.abs(posture.impact! - posture.address!)).toBeLessThan(8);
  });

  it("needs a down-the-line clip", () => {
    const { track, phases } = sample("sample-video-face-on");
    const result = postureCheck(track, { address: phases.Address, top: phases.Top, impact: phases.Impact }, PORTRAIT)!;

    expect(result).toEqual({ view: "face-on", ok: false });
  });

  it("finds the biggest change from Address", () => {
    expect(postureChange({ address: 55, top: 57, impact: 62 })).toBe(7);
    expect(postureChange({ address: 55, top: 49, impact: 57 })).toBe(-6);
    expect(postureChange({ address: 55 })).toBeUndefined();
    expect(postureWithinTolerance({ address: 55, top: 58, impact: 51 })).toBe(true);
    expect(postureWithinTolerance({ address: 55, impact: 62 })).toBe(false);
  });
});

/** A down-the-line golfer facing right: shoulders stacked, 0.3 of leg, hands out toward the ball. */
function dtlFrame(hipX: number): Points {
  return {
    ...torso(hipX, 0.1),
    [LM.leftKnee]: { x: 0.4, y: 0.75 },
    [LM.rightKnee]: { x: 0.4, y: 0.75 },
    [LM.leftAnkle]: { x: 0.4, y: 0.9 },
    [LM.rightAnkle]: { x: 0.4, y: 0.9 },
    [LM.leftWrist]: { x: 0.6, y: 0.65 },
    [LM.rightWrist]: { x: 0.6, y: 0.65 },
  };
}

describe("earlyExtension", () => {
  it("measures the hips moving toward the ball in inches", () => {
    // Address hips at 0.4; Top 0.39 (back), Impact 0.42 (toward the ball, which is to the right).
    const track = syntheticTrack([dtlFrame(0.4), dtlFrame(0.39), dtlFrame(0.42)]);
    const result = earlyExtension(track, { address: 0.05, top: 0.15, impact: 0.25 })!;

    expect(result.ok).toBe(true);
    const extension = result.ok ? result.value : { ballSide: 1 as const };
    // 0.3 of leg = 33 in, so 0.01 = 1.1 in.
    expect(extension.atTop).toBeCloseTo(-1.1, 4);
    expect(extension.atImpact).toBeCloseTo(2.2, 4);
    expect(extensionWithinTolerance(extension)).toBe(false);
    expect(extensionWithinTolerance({ atTop: -3, atImpact: 1 })).toBe(true);
  });

  it("uses the golfer's height", () => {
    const track = syntheticTrack([dtlFrame(0.4), dtlFrame(0.4), dtlFrame(0.42)]);
    const result = earlyExtension(track, { address: 0.05, impact: 0.25 }, 1, { heightInches: 35 })!;
    expect(result.ok && result.value.atImpact).toBeCloseTo(1.1, 4);
  });

  it("stays on the wall in the down-the-line sample", () => {
    const { track, phases } = sample("sample-video-down-the-line");
    const result = earlyExtension(track, { address: phases.Address, top: phases.Top, impact: phases.Impact }, PORTRAIT)!;

    expect(result.ok).toBe(true);
    // The frames show the hips holding their line through impact.
    expect(result.ok && Math.abs(result.value.atImpact!)).toBeLessThan(1.5);
    expect(result.ok && Math.abs(result.value.atTop!)).toBeLessThan(1.5);
  });

  it("needs a down-the-line clip", () => {
    const { track, phases } = sample("sample-video-face-on");
    expect(earlyExtension(track, { address: phases.Address, impact: phases.Impact }, PORTRAIT)).toEqual({
      view: "face-on",
      ok: false,
    });
  });
});

describe("extension guide", () => {
  it("puts the wall behind the hips, away from the ball", () => {
    const track = syntheticTrack([dtlFrame(0.4), dtlFrame(0.42)]);
    const { extension } = buildCheckGuides(track, { address: 0.05, impact: 0.15 });

    expect(extension!.ballSide).toBe(1);
    expect(extension!.wallX).toBeCloseTo(0.4 - 0.3 * 0.18, 5);
    // 1.5 in at 110 in per unit.
    expect(extension!.tolerance).toBeCloseTo(1.5 / 110, 5);
  });
});

describe("table-cell forms", () => {
  it("draws head movement as on-screen arrows", () => {
    // Target to the left on screen (screenSign -1): moving toward it is a left arrow.
    expect(headShiftArrows({ forward: 0.8, down: 1.8 }, -1)).toBe("↓1.8 ←0.8");
    expect(headShiftArrows({ forward: 0.8, down: -0.4 }, 1)).toBe("↑0.4 →0.8");
    expect(headShiftArrows({ forward: 0.1, down: 0.1 }, 1)).toBe("steady");
  });

  it("draws extension toward the ball's side of the screen", () => {
    expect(extensionArrow(0.4, 1)).toBe("→0.4");
    expect(extensionArrow(-0.6, 1)).toBe("←0.6");
    expect(extensionArrow(0.4, -1)).toBe("←0.4");
    expect(extensionArrow(0.1, 1)).toBe("on line");
  });
});

/** Top of a right-hander's swing down-the-line: lead (left) shoulder in front, trail shoulder up and back. */
function topFrame(wrist: { x: number; y: number }): Points {
  return {
    ...dtlFrame(0.4),
    [LM.leftShoulder]: { x: 0.5, y: 0.4 },
    [LM.rightShoulder]: { x: 0.45, y: 0.35 },
    [LM.leftWrist]: wrist,
    [LM.rightWrist]: wrist,
  };
}

describe("leadArmPlane", () => {
  const times = { address: 0.05, top: 0.15 };

  it("measures the lead arm against the shoulder plane at the top", () => {
    // Shoulder plane rises at 45°; an arm rising at atan(0.14 / 0.1) ≈ 54.5° is 9.5° above it.
    const above = leadArmPlane(syntheticTrack([dtlFrame(0.4), topFrame({ x: 0.4, y: 0.26 })]), times)!;
    expect(above.ok && above.value.lead).toBe("left");
    expect(above.ok && above.value.atTop).toBeCloseTo((Math.atan2(0.14, 0.1) * 180) / Math.PI - 45, 4);

    // Flatter than the shoulders: below the plane.
    const below = leadArmPlane(syntheticTrack([dtlFrame(0.4), topFrame({ x: 0.36, y: 0.32 })]), times)!;
    expect(below.ok && below.value.atTop).toBeLessThan(-10);

    // Along the shoulder line: on plane.
    const on = leadArmPlane(syntheticTrack([dtlFrame(0.4), topFrame({ x: 0.4, y: 0.3 })]), times)!;
    expect(on.ok && on.value.atTop).toBeCloseTo(0, 4);
  });

  it("reads the down-the-line sample about as the frames show it", () => {
    const { track, phases } = sample("sample-video-down-the-line");
    const result = leadArmPlane(track, { address: phases.Address, top: phases.Top }, PORTRAIT)!;

    expect(result.ok && result.value.lead).toBe("left");
    // Measured on the Top frame: arm ~9° steeper than the shoulder line.
    expect(result.ok && result.value.atTop).toBeGreaterThan(0);
    expect(result.ok && result.value.atTop).toBeLessThan(20);
  });

  it("needs a down-the-line clip", () => {
    const { track, phases } = sample("sample-video-face-on");
    expect(leadArmPlane(track, { address: phases.Address, top: phases.Top }, PORTRAIT)).toEqual({
      view: "face-on",
      ok: false,
    });
  });
});
