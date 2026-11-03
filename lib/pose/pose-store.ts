import type { PoseTrack } from "@/lib/pose/landmarks";

export type PoseStatus = "unknown" | "checking" | "none" | "analyzing" | "ready" | "error";

export interface PoseState {
  status: PoseStatus;
  /** 0–1 while analyzing. */
  progress: number;
  track?: PoseTrack;
  error?: string;
}

export interface PoseClip {
  id: string;
  url: string;
  fps: number;
}

export interface PoseStoreDeps {
  load: (videoId: string) => Promise<PoseTrack | null>;
  save: (track: PoseTrack) => Promise<void>;
  analyze: (options: {
    videoId: string;
    url: string;
    fps: number;
    signal: AbortSignal;
    onProgress: (fraction: number) => void;
  }) => Promise<PoseTrack>;
}

const UNKNOWN: PoseState = { status: "unknown", progress: 0 };

/**
 * Pose tracks per clip, shared by both panes and the workspace (useSyncExternalStore). Reads the
 * cache on demand, runs analysis when asked, and reports progress.
 */
export function createPoseStore(deps: PoseStoreDeps) {
  const states = new Map<string, PoseState>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<() => void>();
  let version = 0;

  const set = (videoId: string, state: PoseState) => {
    states.set(videoId, state);
    version += 1;
    listeners.forEach((listener) => listener());
  };

  const get = (videoId: string | undefined) => (videoId ? (states.get(videoId) ?? UNKNOWN) : UNKNOWN);

  return {
    get,
    /** Changes on every update; a snapshot for subscribers that read several clips. */
    getVersion: () => version,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Looks for a cached track the first time a clip is shown. */
    async ensureLoaded(videoId: string) {
      if (get(videoId).status !== "unknown") {
        return;
      }

      set(videoId, { status: "checking", progress: 0 });
      const track = await deps.load(videoId).catch(() => null);

      // Analysis may have started (or finished) while the cache was being read.
      if (get(videoId).status === "checking") {
        set(videoId, track ? { status: "ready", progress: 1, track } : { status: "none", progress: 0 });
      }
    },

    async analyze(clip: PoseClip) {
      if (controllers.has(clip.id)) {
        return;
      }

      const controller = new AbortController();
      controllers.set(clip.id, controller);
      set(clip.id, { status: "analyzing", progress: 0 });
      let lastReported = 0;

      try {
        const track = await deps.analyze({
          videoId: clip.id,
          url: clip.url,
          fps: clip.fps,
          signal: controller.signal,
          onProgress: (fraction) => {
            // Re-render at most every 2%, not every frame.
            if (fraction - lastReported >= 0.02 || fraction === 1) {
              lastReported = fraction;
              set(clip.id, { status: "analyzing", progress: fraction });
            }
          },
        });
        set(clip.id, { status: "ready", progress: 1, track });
        await deps.save(track).catch(() => undefined);
      } catch (error) {
        const cancelled = error instanceof DOMException && error.name === "AbortError";
        set(
          clip.id,
          cancelled
            ? { status: "none", progress: 0 }
            : {
                status: "error",
                progress: 0,
                error: error instanceof Error ? error.message : "Pose analysis failed",
              },
        );
      } finally {
        controllers.delete(clip.id);
      }
    },

    cancel(videoId: string) {
      controllers.get(videoId)?.abort();
    },

    /** Stops any running analyses (workspace unmount). */
    cancelAll() {
      controllers.forEach((controller) => controller.abort());
    },
  };
}

export type PoseStore = ReturnType<typeof createPoseStore>;
