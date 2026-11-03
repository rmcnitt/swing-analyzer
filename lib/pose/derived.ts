import { golferBoxFromTrack } from "@/lib/pose/golfer-box";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { detectSwingPositions, type DetectedPositions } from "@/lib/pose/swing-positions";
import type { NormalizedRect, VideoAsset } from "@/lib/types";

// Tracks are immutable once prepared, so results are cached per track object.
const boxes = new WeakMap<PoseTrack, NormalizedRect | null>();
const positions = new WeakMap<PoseTrack, DetectedPositions | null>();

const aspectOf = (video?: Pick<VideoAsset, "width" | "height">) =>
  video?.width && video?.height ? video.width / video.height : 1;

export function autoGolferBox(track: PoseTrack, video?: Pick<VideoAsset, "width" | "height">) {
  if (!boxes.has(track)) {
    boxes.set(track, golferBoxFromTrack(track, aspectOf(video)));
  }

  return boxes.get(track) ?? null;
}

export function autoSwingPositions(track: PoseTrack, video?: Pick<VideoAsset, "width" | "height">) {
  if (!positions.has(track)) {
    positions.set(track, detectSwingPositions(track, aspectOf(video)));
  }

  return positions.get(track) ?? null;
}
