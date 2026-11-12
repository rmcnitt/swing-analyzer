import {
  FRAME_STRIDE,
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  POSE_TRACK_VERSION,
  type PoseTrack,
} from "@/lib/pose/landmarks";

/**
 * A pose track recorded from one of the bundled sample clips (image landmarks only), as JSON.
 * Used by the detection tests and by the landing page's hero, which shows the real overlays
 * without running the model.
 */
export interface PoseRecording {
  videoId: string;
  duration: number;
  times: number[];
  /** Per frame: 33 × [x, y, visibility], or null when no golfer was found. */
  frames: Array<number[] | null>;
}

export function poseTrackFromRecording(recording: PoseRecording): PoseTrack {
  const data = new Float32Array(recording.times.length * FRAME_STRIDE).fill(NaN);

  recording.frames.forEach((frame, index) => {
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
    videoId: recording.videoId,
    model: "pose_landmarker_full",
    times: recording.times,
    data,
    duration: recording.duration,
    analyzedAt: "2026-11-03T00:00:00.000Z",
  };
}
