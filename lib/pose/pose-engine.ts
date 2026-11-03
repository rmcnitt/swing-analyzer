"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import {
  FRAME_STRIDE,
  POSE_TRACK_VERSION,
  sampleTimes,
  writeFrame,
  type PoseTrack,
} from "@/lib/pose/landmarks";

/** Served from public/ (wasm copied from node_modules by scripts/copy-mediapipe-wasm.mjs). */
const WASM_BASE = "/mediapipe/wasm";
const MODEL = "pose_landmarker_full";
const MODEL_URL = `/mediapipe/${MODEL}.task`;

export interface AnalyzeOptions {
  videoId: string;
  url: string;
  fps: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

type VisionModule = typeof import("@mediapipe/tasks-vision");
type WasmFileset = Awaited<ReturnType<VisionModule["FilesetResolver"]["forVisionTasks"]>>;

let runtime: Promise<{ vision: VisionModule; fileset: WasmFileset }> | null = null;

/** Loads the MediaPipe JS + wasm once, on first use (never on page load). */
function loadRuntime() {
  runtime ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    return { vision, fileset };
  })();
  runtime.catch(() => {
    runtime = null;
  });

  return runtime;
}

async function createLandmarker(): Promise<PoseLandmarker> {
  const { vision, fileset } = await loadRuntime();
  const create = (delegate: "GPU" | "CPU") =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });

  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}

function abortError() {
  return new DOMException("Pose analysis cancelled", "AbortError");
}

function waitFor(element: HTMLVideoElement, event: "loadeddata" | "seeked", signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(event, onDone);
      element.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be decoded for pose analysis"));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    element.addEventListener(event, onDone, { once: true });
    element.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Lets the page paint between frames so the UI stays responsive during analysis. */
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

// One analysis at a time: the model is heavy and GPU contention just slows both down.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs pose detection on every frame of a clip (a hidden <video> seeked frame by frame) and
 * returns the packed track. Rejects with an AbortError when `signal` aborts.
 */
export function analyzeVideo(options: AnalyzeOptions): Promise<PoseTrack> {
  const job = queue.then(() => runAnalysis(options));
  queue = job.catch(() => undefined);
  return job;
}

async function runAnalysis({ videoId, url, fps, signal, onProgress }: AnalyzeOptions) {
  if (signal?.aborted) {
    throw abortError();
  }

  onProgress?.(0);
  const element = document.createElement("video");
  element.muted = true;
  element.playsInline = true;
  element.preload = "auto";
  element.crossOrigin = "anonymous";
  const loaded = waitFor(element, "loadeddata", signal);
  element.src = url;

  let landmarker: PoseLandmarker | null = null;
  const creating = createLandmarker();

  try {
    [landmarker] = await Promise.all([creating, loaded]);
    const duration = element.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("The video has no readable length");
    }

    const times = sampleTimes(duration, fps);
    const data = new Float32Array(times.length * FRAME_STRIDE);

    for (let index = 0; index < times.length; index += 1) {
      if (signal?.aborted) {
        throw abortError();
      }

      const seeked = waitFor(element, "seeked", signal);
      element.currentTime = times[index];
      await seeked;

      // VIDEO mode wants strictly increasing timestamps (ms); media time works for one pass.
      const result = landmarker.detectForVideo(element, Math.round(times[index] * 1000) + index);
      writeFrame(data, index, result.landmarks[0], result.worldLandmarks[0]);
      onProgress?.((index + 1) / times.length);

      if (index % 4 === 3) {
        await yieldToBrowser();
      }
    }

    return {
      version: POSE_TRACK_VERSION,
      videoId,
      model: MODEL,
      times,
      data,
      duration,
      analyzedAt: new Date().toISOString(),
    } satisfies PoseTrack;
  } finally {
    // If loading failed first, the model may still be coming up; close it once it is.
    if (landmarker) {
      landmarker.close();
    } else {
      void creating.then((late) => late.close()).catch(() => undefined);
    }
    element.removeAttribute("src");
    element.load();
  }
}
