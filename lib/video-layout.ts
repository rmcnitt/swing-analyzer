import type { VideoAsset } from "@/lib/types";

const FALLBACK_ASPECT_RATIO = 16 / 9;

export function getVideoAspectRatio(video?: Pick<VideoAsset, "width" | "height">) {
  if (!video?.width || !video?.height || video.width <= 0 || video.height <= 0) {
    return FALLBACK_ASPECT_RATIO;
  }

  return video.width / video.height;
}

export function getContainedStageSize(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
) {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return {
      width: 0,
      height: 0,
    };
  }

  const containerRatio = containerWidth / containerHeight;

  if (containerRatio > aspectRatio) {
    return {
      width: Math.round(containerHeight * aspectRatio),
      height: Math.round(containerHeight),
    };
  }

  return {
    width: Math.round(containerWidth),
    height: Math.round(containerWidth / aspectRatio),
  };
}
