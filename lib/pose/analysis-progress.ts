import { DEFAULT_FPS } from "@/lib/analysis/frames";

/** How many frames pose analysis looks at (matches `sampleTimes`, without building the list). */
export function sampledFrameCount(duration: number, fps: number, maxFrames = 1200) {
  const total = Math.max(1, Math.ceil(duration * fps - 1e-3));
  const stride = Math.max(1, Math.ceil(total / maxFrames));
  return Math.ceil(total / stride);
}

/** "Analyzing frame 84 / 150", or "Analyzing 56%" when the clip's length isn't known yet. */
export function analysisProgressText(progress: number, duration?: number, fps?: number) {
  const fraction = Math.min(1, Math.max(0, progress));

  if (!duration || !(duration > 0)) {
    return `Analyzing ${Math.round(fraction * 100)}%`;
  }

  const total = sampledFrameCount(duration, fps && fps > 0 ? fps : DEFAULT_FPS);
  return `Analyzing frame ${Math.round(fraction * total)} / ${total}`;
}
