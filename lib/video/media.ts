"use client";

import { estimateFpsFromMediaTimes } from "@/lib/analysis/frames";

export interface VideoFileMetadata {
  duration: number;
  width: number;
  height: number;
}

/** Reads duration and intrinsic dimensions from a video URL (object URL or same-origin path). */
export function readVideoMetadata(url: string) {
  return new Promise<VideoFileMetadata>((resolve) => {
    const element = document.createElement("video");

    element.preload = "metadata";
    element.src = url;

    element.onloadedmetadata = () => {
      resolve({
        duration: element.duration || 0,
        width: element.videoWidth || 0,
        height: element.videoHeight || 0,
      });
      element.src = "";
    };

    element.onerror = () => {
      resolve({ duration: 0, width: 0, height: 0 });
      element.src = "";
    };
  });
}

/** Captures a small JPEG poster frame from near the start of the video. */
export function createVideoThumbnail(url: string) {
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    const capture = () => {
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
    video.onerror = () => resolve(null);
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
