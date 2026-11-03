import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FRAME_STRIDE,
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  POSE_TRACK_VERSION,
  type PoseTrack,
} from "@/lib/pose/landmarks";

interface PoseFixture {
  videoId: string;
  duration: number;
  times: number[];
  /** Per frame: 33 × [x, y, visibility], or null when no golfer was found. */
  frames: Array<number[] | null>;
}

/**
 * Pose tracks recorded from the bundled sample clips (image landmarks only), so detection is
 * tested on real model output.
 */
export function loadPoseFixture(name: "sample-video-face-on" | "sample-video-down-the-line"): PoseTrack {
  const fixture = JSON.parse(
    readFileSync(path.join(__dirname, "..", "fixtures", "pose", `${name}.json`), "utf8"),
  ) as PoseFixture;
  const data = new Float32Array(fixture.times.length * FRAME_STRIDE).fill(NaN);

  fixture.frames.forEach((frame, index) => {
    if (!frame) {
      return;
    }

    for (let landmark = 0; landmark < LANDMARK_COUNT; landmark += 1) {
      const offset = index * FRAME_STRIDE + landmark * LANDMARK_STRIDE;
      data[offset] = frame[landmark * 3];
      data[offset + 1] = frame[landmark * 3 + 1];
      data[offset + 2] = frame[landmark * 3 + 2];
    }
  });

  return {
    version: POSE_TRACK_VERSION,
    videoId: fixture.videoId,
    model: "pose_landmarker_full",
    times: fixture.times,
    data,
    duration: fixture.duration,
    analyzedAt: "2026-11-03T00:00:00.000Z",
  };
}
