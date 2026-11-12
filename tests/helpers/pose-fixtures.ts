import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { poseTrackFromRecording, type PoseRecording } from "@/lib/pose/pose-recording";

/**
 * Pose tracks recorded from the bundled sample clips (image landmarks only), so detection is
 * tested on real model output.
 */
export function loadPoseFixture(name: "sample-video-face-on" | "sample-video-down-the-line"): PoseTrack {
  const recording = JSON.parse(
    readFileSync(path.join(__dirname, "..", "fixtures", "pose", `${name}.json`), "utf8"),
  ) as PoseRecording;
  return poseTrackFromRecording(recording);
}
