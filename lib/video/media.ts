"use client";

import { estimateFpsFromMediaTimes } from "@/lib/analysis/frames";
import { readBlobContainerMetadata } from "@/lib/video/container";
import { classifyMediaError, type PlaybackProblem } from "@/lib/video/playback-errors";

export interface VideoFileMetadata {
  duration: number;
  width: number;
  height: number;
  /** Frame rate read from the file's header, when it has one (MP4/MOV). */
  fps?: number;
  /** Set when this browser can't play the file (no picture, or a media error). */
  problem?: PlaybackProblem;
}

/** File-input filter. Explicit .mov/.m4v so iPhone camera-roll clips are never greyed out. */
export const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,video/quicktime";

// How long to wait for the browser to report metadata before trusting the file header instead.
const METADATA_TIMEOUT_MS = 5000;

/** Asks a detached <video> for duration and display size; null if it never answers. */
function probeElementMetadata(url: string, timeoutMs: number) {
  return new Promise<VideoFileMetadata | null>((resolve) => {
    const element = document.createElement("video");
    const done = (result: VideoFileMetadata | null) => {
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      resolve(result);
    };
    // iOS Safari may never load a detached video (always in Low Power Mode), so don't wait forever.
    const timer = window.setTimeout(() => done(null), timeoutMs);

    element.onloadedmetadata = () =>
      done({
        duration: element.duration || 0,
        width: element.videoWidth || 0,
        height: element.videoHeight || 0,
        // Unsupported video codecs (e.g. HEVC in Chrome) can still expose an audio-only track.
        problem: element.videoWidth ? undefined : "unsupported",
      });
    element.onerror = () =>
      done({ duration: 0, width: 0, height: 0, problem: classifyMediaError(element.error?.code) });

    element.muted = true;
    element.playsInline = true;
    element.preload = "metadata";
    element.src = url;
    element.load();
  });
}

/**
 * Reads duration and display size for a video URL (object URL or same-origin path). Pass the
 * File too: its MP4/MOV header supplies the frame rate, and stands in for the browser when the
 * browser won't load the clip in the background (iPhone camera-roll imports).
 */
export async function readVideoMetadata(url: string, file?: Blob): Promise<VideoFileMetadata> {
  const [element, header] = await Promise.all([
    probeElementMetadata(url, METADATA_TIMEOUT_MS),
    file ? readBlobContainerMetadata(file) : Promise.resolve(null),
  ]);
  const fps = header?.fps ?? undefined;

  if (element) {
    return { ...element, fps };
  }

  if (header) {
    return { duration: header.duration, width: header.width, height: header.height, fps };
  }

  return { duration: 0, width: 0, height: 0, problem: "unsupported" };
}

/** Captures a small JPEG poster frame from near the start of the video. */
export function createVideoThumbnail(url: string, timeoutMs = 6000) {
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement("video");
    // A missing thumbnail is fine; a stalled import isn't (iOS may never load a detached video).
    const timer = window.setTimeout(() => {
      video.removeAttribute("src");
      video.load();
      resolve(null);
    }, timeoutMs);

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    const capture = () => {
      window.clearTimeout(timer);
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.round((canvas.width / width) * height);

      const context = canvas.getContext("2d");

      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.72);
      // Release the decoder so the caller can revoke the source URL.
      video.removeAttribute("src");
      video.load();
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = capture;
    video.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    video.load();
  });
}

/**
 * Measures a clip's frame rate by playing it hidden (muted, quarter speed so even 240fps fits a
 * 60Hz display) and recording presented frames' media times via requestVideoFrameCallback.
 * Resolves null where rVFC is unsupported or nothing could be measured.
 */
export function detectVideoFps(url: string, timeoutMs = 4000) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");

    if (!("requestVideoFrameCallback" in video)) {
      resolve(null);
      return;
    }

    const mediaTimes: number[] = [];
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      window.clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve(estimateFpsFromMediaTimes(mediaTimes));
    };

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      mediaTimes.push(metadata.mediaTime);

      if (mediaTimes.length >= 24 || video.ended) {
        finish();
        return;
      }

      video.requestVideoFrameCallback(onFrame);
    };

    const timer = window.setTimeout(finish, timeoutMs);

    // Some browsers only present frames for videos in the document.
    video.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.defaultPlaybackRate = 0.25;
    video.playbackRate = 0.25;
    video.onerror = finish;
    video.onended = finish;
    video.src = url;
    document.body.appendChild(video);
    video.requestVideoFrameCallback(onFrame);
    void video.play().catch(finish);
  });
}
