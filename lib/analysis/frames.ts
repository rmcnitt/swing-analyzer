/** Used when a clip's frame rate is unknown and couldn't be detected. */
export const DEFAULT_FPS = 60;

const commonFrameRates = [
  23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240, 480,
];

/** Snaps a measured rate to the nearest standard rate within 3%, else rounds to 0.01. */
export function snapFrameRate(fps: number) {
  const nearest = commonFrameRates.reduce((best, rate) =>
    Math.abs(rate - fps) < Math.abs(best - fps) ? rate : best,
  );

  return Math.abs(nearest - fps) / nearest <= 0.03 ? nearest : Math.round(fps * 100) / 100;
}

/**
 * Estimates fps from consecutive presented-frame media times (requestVideoFrameCallback).
 * The display can skip frames, so gaps are often multiples of the true frame duration; the
 * frame duration is the cluster of smallest gaps.
 */
export function estimateFpsFromMediaTimes(mediaTimes: number[]): number | null {
  const gaps = mediaTimes
    .slice(1)
    .map((time, index) => time - mediaTimes[index])
    .filter((gap) => gap > 1e-4)
    .sort((a, b) => a - b);

  if (gaps.length < 3) {
    return null;
  }

  const lowQuartile = gaps[Math.floor((gaps.length - 1) / 4)];
  const cluster = gaps.filter((gap) => Math.abs(gap - lowQuartile) <= lowQuartile * 0.15);
  const frameDuration = cluster.reduce((sum, gap) => sum + gap, 0) / cluster.length;
  const fps = 1 / frameDuration;

  return fps >= 10 && fps <= 1000 ? snapFrameRate(fps) : null;
}

export function frameDuration(fps?: number) {
  return 1 / (fps && fps > 0 ? fps : DEFAULT_FPS);
}

/** Index of the frame displayed at `time` (tolerates float error at frame boundaries). */
export function frameIndexAt(time: number, fps?: number) {
  return Math.max(0, Math.floor(time / frameDuration(fps) + 1e-3));
}

/**
 * Time to seek to for stepping `frames` frames from `currentTime`. Lands on the middle of the
 * target frame so rounding in the decoder can't show its neighbour.
 */
export function stepFrameTime(currentTime: number, fps: number | undefined, frames: number, duration: number) {
  const step = frameDuration(fps);
  const lastIndex = Math.max(0, Math.ceil(duration / step - 1e-3) - 1);
  const target = Math.min(lastIndex, Math.max(0, frameIndexAt(currentTime, fps) + frames));

  return Math.min(duration, (target + 0.5) * step);
}

/** Choices for manually setting a clip's frame rate. */
export const frameRateOptions = [24, 25, 30, 50, 60, 120, 240];

/** Options for a frame-rate picker, including `current` if it's a non-standard value. */
export function frameRateChoices(current?: number) {
  return current && !frameRateOptions.includes(current)
    ? [...frameRateOptions, current].sort((a, b) => a - b)
    : frameRateOptions;
}
