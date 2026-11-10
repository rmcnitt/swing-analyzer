import { golferBoxFromTrack } from "@/lib/pose/golfer-box";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { detectSwingPhases, type DetectedPositions, type SwingPhases } from "@/lib/pose/swing-positions";
import type { NormalizedRect, VideoAsset } from "@/lib/types";

// Tracks are immutable once prepared, so results are cached per track object.
const boxes = new WeakMap<PoseTrack, NormalizedRect | null>();
const phases = new WeakMap<PoseTrack, SwingPhases | null>();

type FrameSize = Pick<VideoAsset, "width" | "height">;

export const aspectOf = (video?: FrameSize) =>
  video?.width && video?.height ? video.width / video.height : 1;

export function autoGolferBox(track: PoseTrack, video?: FrameSize) {
  if (!boxes.has(track)) {
    boxes.set(track, golferBoxFromTrack(track, aspectOf(video)));
  }

  return boxes.get(track) ?? null;
}

/** Detected positions plus the takeaway start, or null when no swing was found. */
export function autoSwingPhases(track: PoseTrack, video?: FrameSize) {
  if (!phases.has(track)) {
    phases.set(track, detectSwingPhases(track, aspectOf(video)));
  }

  return phases.get(track) ?? null;
}

export function autoSwingPositions(track: PoseTrack, video?: FrameSize): DetectedPositions | null {
  const swing = autoSwingPhases(track, video);

  if (!swing) {
    return null;
  }

  const { Address, Top, Impact, Finish } = swing;
  return Object.fromEntries(
    Object.entries({ Address, Top, Impact, Finish }).filter(([, time]) => time !== undefined),
  ) as DetectedPositions;
}
