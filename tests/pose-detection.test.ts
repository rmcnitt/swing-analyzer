import { describe, expect, it } from "vitest";
import { cleanTrack, fixSideSwaps } from "@/lib/pose/clean-track";
import { golferBoxFromTrack } from "@/lib/pose/golfer-box";
import {
  FRAME_STRIDE,
  LANDMARK_COUNT,
  landmarkAt,
  LM,
  POSE_TRACK_VERSION,
  writeFrame,
  type PoseTrack,
} from "@/lib/pose/landmarks";
import { detectSwingPositions } from "@/lib/pose/swing-positions";
import { loadPoseFixture } from "@/tests/helpers/pose-fixtures";

const PORTRAIT = 720 / 1280;

/**
 * Hand-labelled from the sample clips' frames (seconds), with the user's review: Address must be
 * before the clubhead starts back (any settled frame is right), Finish once the body has stopped.
 */
const truth = {
  "sample-video-face-on": { Address: [1.4, 1.7], Top: 2.52, Impact: 2.78, Finish: [3.3, 3.6] },
  "sample-video-down-the-line": { Address: [0.8, 1.1], Top: 1.84, Impact: 2.085, Finish: [2.7, 2.95] },
} as const;

describe("detectSwingPositions on recorded sample swings", () => {
  for (const [name, expected] of Object.entries(truth) as Array<
    [keyof typeof truth, (typeof truth)[keyof typeof truth]]
  >) {
    it(`finds the positions in ${name}`, () => {
      const detected = detectSwingPositions(cleanTrack(loadPoseFixture(name)), PORTRAIT);

      expect(detected).not.toBeNull();
      // Within ~3 frames at 60 fps.
      expect(detected!.Top).toBeGreaterThan(expected.Top - 0.05);
      expect(detected!.Top).toBeLessThan(expected.Top + 0.05);
      expect(detected!.Impact).toBeGreaterThan(expected.Impact - 0.04);
      expect(detected!.Impact).toBeLessThan(expected.Impact + 0.04);
      expect(detected!.Address).toBeGreaterThanOrEqual(expected.Address[0]);
      expect(detected!.Address).toBeLessThanOrEqual(expected.Address[1]);
      expect(detected!.Finish).toBeGreaterThanOrEqual(expected.Finish[0]);
      expect(detected!.Finish).toBeLessThanOrEqual(expected.Finish[1]);
    });
  }
});

/** A synthetic track: every landmark at `pose(time)` plus a per-landmark offset. */
function syntheticTrack(
  times: number[],
  pose: (time: number, landmark: number) => { x: number; y: number } | null,
): PoseTrack {
  const data = new Float32Array(times.length * FRAME_STRIDE);

  times.forEach((time, index) => {
    const points = Array.from({ length: LANDMARK_COUNT }, (_, landmark) => pose(time, landmark));
    const missing = points.some((point) => !point);
    writeFrame(
      data,
      index,
      missing ? undefined : points.map((point) => ({ ...point!, visibility: 0.9 })),
      missing ? undefined : points.map((point) => ({ ...point!, z: 0 })),
    );
  });

  return {
    version: POSE_TRACK_VERSION,
    videoId: "synthetic",
    model: "test",
    times,
    data,
    duration: times.at(-1) ?? 0,
    analyzedAt: "2026-11-03T00:00:00.000Z",
  };
}

const frames = (count: number, fps = 60) => Array.from({ length: count }, (_, i) => (i + 0.5) / fps);

/** A standing golfer: shoulders at 0.3, hips 0.45, ankles 0.6; left side at x 0.45, right 0.55. */
function standing(landmark: number) {
  const side = landmark % 2 === 1 ? 0.45 : 0.55;
  const heights: Record<number, number> = {
    [LM.nose]: 0.25,
    [LM.leftShoulder]: 0.3,
    [LM.rightShoulder]: 0.3,
    [LM.leftHip]: 0.45,
    [LM.rightHip]: 0.45,
    [LM.leftKnee]: 0.53,
    [LM.rightKnee]: 0.53,
    [LM.leftAnkle]: 0.6,
    [LM.rightAnkle]: 0.6,
  };
  return { x: landmark === LM.nose ? 0.5 : side, y: heights[landmark] ?? 0.4 };
}

describe("detectSwingPositions edge cases", () => {
  it("returns null when the hands barely move", () => {
    const track = syntheticTrack(frames(120), (time, landmark) => standing(landmark));
    expect(detectSwingPositions(track)).toBeNull();
  });

  it("returns null when the golfer is mostly not found", () => {
    const track = syntheticTrack(frames(120), (time, landmark) => (time < 1 ? null : standing(landmark)));
    expect(detectSwingPositions(track)).toBeNull();
  });

  it("follows a simple synthetic swing", () => {
    // Hands: still at 0.45 until 0.5s, up to 0.2 at 1.0s, down to 0.45 at 1.25s, up to 0.2 by 1.5s.
    const handY = (time: number) => {
      if (time < 0.5) return 0.45;
      if (time < 1) return 0.45 - ((time - 0.5) / 0.5) * 0.25;
      if (time < 1.25) return 0.2 + ((time - 1) / 0.25) * 0.25;
      if (time < 1.5) return 0.45 - ((time - 1.25) / 0.25) * 0.25;
      return 0.2;
    };
    const track = syntheticTrack(frames(150), (time, landmark) =>
      landmark === LM.leftWrist || landmark === LM.rightWrist
        ? { x: 0.5, y: handY(time) }
        : standing(landmark),
    );

    const detected = detectSwingPositions(track)!;

    expect(detected.Address).toBeLessThanOrEqual(0.5);
    expect(detected.Top).toBeCloseTo(1, 1);
    expect(detected.Impact).toBeCloseTo(1.25, 1);
    expect(detected.Finish).toBeGreaterThanOrEqual(1.45);
  });
});

describe("cleanTrack", () => {
  it("swaps back a frame whose left and right sides flipped", () => {
    const track = syntheticTrack(frames(5), (time, landmark) => {
      const point = standing(landmark);
      // Frame 2 has every left/right pair mirrored.
      return Math.abs(time - 2.5 / 60) < 1e-6 && landmark >= 7 ? { ...point, x: 1 - point.x } : point;
    });
    const data = new Float32Array(track.data);

    expect(fixSideSwaps(track, data)).toBe(1);
    expect(landmarkAt({ ...track, data }, 2, LM.leftShoulder).x).toBeCloseTo(0.45);
  });

  it("smooths a one-frame jump", () => {
    const track = syntheticTrack(frames(3), (time, landmark) =>
      landmark === LM.leftWrist && Math.abs(time - 1.5 / 60) < 1e-6 ? { x: 0.6, y: 0.4 } : standing(landmark),
    );

    expect(landmarkAt(cleanTrack(track), 1, LM.leftWrist).x).toBeCloseTo((0.45 + 1.2 + 0.45) / 4);
  });

  it("leaves the raw track untouched", () => {
    const track = loadPoseFixture("sample-video-face-on");
    const before = track.data[FRAME_STRIDE * 10];
    cleanTrack(track);
    expect(track.data[FRAME_STRIDE * 10]).toBe(before);
  });
});

describe("golferBoxFromTrack", () => {
  it("covers the body with head room above the nose", () => {
    const box = golferBoxFromTrack(syntheticTrack(frames(10), (time, landmark) => standing(landmark)))!;

    expect(box.x).toBeLessThan(0.45);
    expect(box.x + box.width).toBeGreaterThan(0.55);
    // Nose at 0.25, shoulders at 0.3 → head top about 0.205.
    expect(box.y).toBeLessThan(0.21);
    expect(box.y + box.height).toBeGreaterThan(0.6);
  });

  it("leaves room for the club around the hands", () => {
    const track = syntheticTrack(frames(10), (time, landmark) =>
      landmark === LM.leftWrist || landmark === LM.rightWrist ? { x: 0.5, y: 0.3 } : standing(landmark),
    );
    const box = golferBoxFromTrack(track)!;

    // Body height 0.3 → club reach ~0.2 above hands at 0.3 (above the head top at ~0.205).
    expect(box.y).toBeLessThan(0.15);
    expect(box.x).toBeLessThan(0.35);
  });

  it("frames the sample golfer and ignores frames with no pose", () => {
    const box = golferBoxFromTrack(loadPoseFixture("sample-video-down-the-line"), PORTRAIT)!;

    expect(box.width).toBeGreaterThan(0.2);
    expect(box.height).toBeGreaterThan(0.3);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(golferBoxFromTrack(syntheticTrack(frames(10), () => null))).toBeNull();
  });
});
