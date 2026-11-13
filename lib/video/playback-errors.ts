/** "storage": the browser refused to save the imported file (too large for its quota, or a WebKit blob bug). */
export type PlaybackProblem = "unsupported" | "decode" | "network" | "missing" | "storage";

// HTMLMediaElement MediaError codes (MediaError.MEDIA_ERR_*), inlined so this stays DOM-free.
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;

export function classifyMediaError(code: number | undefined): PlaybackProblem {
  switch (code) {
    case MEDIA_ERR_ABORTED:
    case MEDIA_ERR_NETWORK:
      return "network";
    case MEDIA_ERR_DECODE:
      return "decode";
    default:
      // MEDIA_ERR_SRC_NOT_SUPPORTED, or unknown: treat as a codec/container the browser lacks.
      return "unsupported";
  }
}

/** iPhone and many cameras record HEVC in a .mov/QuickTime container. */
export function isLikelyHevc(source: { fileName?: string; mimeType?: string }) {
  const name = source.fileName?.toLowerCase() ?? "";
  const type = source.mimeType?.toLowerCase() ?? "";

  return (
    name.endsWith(".mov") ||
    name.endsWith(".hevc") ||
    name.endsWith(".heic") ||
    type.includes("quicktime") ||
    type.includes("hevc")
  );
}

const convertAdvice =
  "Convert it to an H.264 MP4 (for example with the free HandBrake app, \"Fast 1080p30\" preset) and import that instead.";

export function describePlaybackProblem(
  problem: PlaybackProblem,
  source: { fileName?: string; mimeType?: string } = {},
) {
  switch (problem) {
    case "missing":
      return {
        title: "Video data is missing",
        detail:
          "This clip's file is no longer stored in this browser (the browser may have cleared it to free space). Import the clip again.",
      };
    case "storage":
      return {
        title: "The video couldn't be saved",
        detail:
          "This browser couldn't store the clip, usually because it's too large for the space it allows. Trim it to just the swing (a few seconds) in Photos and import it again.",
      };
    case "network":
      return {
        title: "The video couldn't be loaded",
        detail: "Reload the page and try again.",
      };
    case "decode":
      return {
        title: "The video couldn't be decoded",
        detail: `The file may be damaged or use an encoding this browser can't handle. ${convertAdvice}`,
      };
    case "unsupported":
      return {
        title: "This browser can't play this video",
        detail: isLikelyHevc(source)
          ? `It's probably HEVC (H.265), the default on iPhone, which Chrome and Firefox can't play on many computers. Open the app in Safari, or ${convertAdvice.charAt(0).toLowerCase()}${convertAdvice.slice(1)} For future clips, set iPhone Settings → Camera → Formats → Most Compatible.`
          : `The format or codec isn't supported here. ${convertAdvice}`,
      };
  }
}
