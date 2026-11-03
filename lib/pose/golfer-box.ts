import { MIN_VISIBILITY } from "@/lib/pose/draw-skeleton";
import { hasPose, LANDMARK_COUNT, landmarkAt, LM, type PoseTrack } from "@/lib/pose/landmarks";
import type { NormalizedRect } from "@/lib/types";
import { clamp } from "@/lib/utils";

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

/**
 * The area the golfer's body covers over the whole swing, for "Fit golfer". Per-frame extents of
 * the confident landmarks are combined with percentiles so a few bad frames can't stretch the
 * box. The top is raised from the eyes to the top of the head, which has no landmark.
 */
export function golferBoxFromTrack(track: PoseTrack, minFrames = 5): NormalizedRect | null {
  const lefts: number[] = [];
  const rights: number[] = [];
  const tops: number[] = [];
  const bottoms: number[] = [];

  for (let frame = 0; frame < track.times.length; frame += 1) {
    if (!hasPose(track, frame)) {
      continue;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let landmark = 0; landmark < LANDMARK_COUNT; landmark += 1) {
      const point = landmarkAt(track, frame, landmark);

      if (point.visibility < MIN_VISIBILITY) {
        continue;
      }

      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    if (!Number.isFinite(minX)) {
      continue;
    }

    // No landmark marks the top of the head; it's about nose-to-shoulders above the nose.
    const nose = landmarkAt(track, frame, LM.nose);
    const shoulderY =
      (landmarkAt(track, frame, LM.leftShoulder).y + landmarkAt(track, frame, LM.rightShoulder).y) / 2;
    const headTop = nose.y - Math.max(0, shoulderY - nose.y) * 0.9;

    lefts.push(minX);
    rights.push(maxX);
    tops.push(Number.isFinite(headTop) ? Math.min(minY, headTop) : minY);
    bottoms.push(maxY);
  }

  if (lefts.length < minFrames) {
    return null;
  }

  const sort = (values: number[]) => [...values].sort((a, b) => a - b);
  const left = percentile(sort(lefts), 0.03);
  const right = percentile(sort(rights), 0.97);
  const top = percentile(sort(tops), 0.03);
  const bottom = percentile(sort(bottoms), 0.97);
  const padX = (right - left) * 0.04;
  const padY = (bottom - top) * 0.03;

  const x = clamp(left - padX, 0, 1);
  const y = clamp(top - padY, 0, 1);
  const width = clamp(right + padX, 0, 1) - x;
  const height = clamp(bottom + padY, 0, 1) - y;

  return width > 0.02 && height > 0.02 ? { x, y, width, height } : null;
}
