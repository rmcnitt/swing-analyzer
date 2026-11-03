import { golferBoxFromTrack } from "@/lib/pose/golfer-box";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { detectSwingPositions, type DetectedPositions } from "@/lib/pose/swing-positions";
import type { NormalizedRect, VideoAsset } from "@/lib/types";

// Tracks are immutable once prepared, so results are cached per track object.
const boxes = new WeakMap<PoseTrack, NormalizedRect | null>();
const positions = new WeakMap<PoseTrack, DetectedPositions | null>();

export function autoGolferBox(track: PoseTrack) {
  if (!boxes.has(track)) {
    boxes.set(track, golferBoxFromTrack(track));
  }

  return boxes.get(track) ?? null;
}

export function autoSwingPositions(track: PoseTrack, video?: Pick<VideoAsset, "width" | "height">) {
  if (!positions.has(track)) {
    const aspect = video?.width && video?.height ? video.width / video.height : 1;
    positions.set(track, detectSwingPositions(track, aspect));
  }

  return positions.get(track) ?? null;
}
