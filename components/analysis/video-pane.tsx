"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  Check,
  Pencil,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  UploadCloud,
} from "lucide-react";
import { AnnotationCanvas } from "@/components/analysis/annotation-canvas";
import { Timeline } from "@/components/analysis/timeline";
import {
  DEFAULT_FPS,
  frameDuration,
  frameIndexAt,
  frameRateChoices,
  stepFrameTime,
} from "@/lib/analysis/frames";
import type { SyncGroup, SyncMedia } from "@/lib/analysis/sync-group";
import { detectVideoFps } from "@/lib/video/media";
import { classifyMediaError, type PlaybackProblem } from "@/lib/video/playback-errors";
import { createTimeStore, type TimeStore } from "@/lib/video/time-store";
import { PlaybackProblemNotice } from "@/components/analysis/playback-problem-notice";
import { getContainedStageSize, getVideoAspectRatio } from "@/lib/video-layout";
import type {
  AnalysisPane,
  AnnotationObject,
  AnnotationTool,
  HexColor,
  PaneId,
  SnapshotMarker,
  VideoAsset,
} from "@/lib/types";
import { clamp, cn, formatTimecode, getVideoLabel } from "@/lib/utils";

interface VideoPaneProps {
  pane: AnalysisPane;
  video?: VideoAsset;
  videos: VideoAsset[];
  annotations: AnnotationObject[];
  markers: SnapshotMarker[];
  activeTool: AnnotationTool;
  activeColor: HexColor;
  selectedAnnotationId?: string | null;
  isActive: boolean;
  /** Shared playback coordinator; the pane registers its video and routes transport through it. */
  syncGroup: SyncGroup;
  compareMode?: boolean;
  isComparisonPane?: boolean;
  onActivate: (paneId: PaneId) => void;
  onSelectVideo: (paneId: PaneId, videoId: string) => void;
  onUploadVideo: (paneId: PaneId, file: File) => void;
  onVideoMetadata: (
    videoId: string,
    metadata: {
      duration?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onRenameVideo: (videoId: string, title: string) => void;
  onSetVideoFps: (videoId: string, fps: number, source: "detected" | "manual") => void;
  onUpdatePane: (paneId: PaneId, patch: Partial<AnalysisPane>) => void;
  onChangeRate: (paneId: PaneId, rate: number) => void;
  onSelectionChange: (paneId: PaneId, annotationId: string | null) => void;
  onAnnotationsChange: (paneId: PaneId, annotations: AnnotationObject[]) => void;
}

const speedOptions = [0.1, 0.25, 0.5, 0.75, 1];

export function VideoPane({
  pane,
  video,
  videos,
  annotations,
  markers,
  activeTool,
  activeColor,
  selectedAnnotationId,
  isActive,
  syncGroup,
  compareMode = false,
  isComparisonPane = false,
  onActivate,
  onSelectVideo,
  onUploadVideo,
  onVideoMetadata,
  onRenameVideo,
  onSetVideoFps,
  onUpdatePane,
  onChangeRate,
  onSelectionChange,
  onAnnotationsChange,
}: VideoPaneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [duration, setDuration] = useState(video?.duration ?? 0);
  // Playhead lives outside React state; only the transport bar subscribes to per-frame updates.
  const [timeStore] = useState(() => createTimeStore(pane.currentTime));
  const baseRateRef = useRef(pane.playbackRate);
  const rateMultiplierRef = useRef(1);
  const [media] = useState<SyncMedia>(() => ({
    get currentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
    get paused() {
      return videoRef.current?.paused ?? true;
    },
    get ended() {
      return videoRef.current?.ended ?? false;
    },
    play() {
      void videoRef.current?.play().catch(() => undefined);
    },
    pause() {
      videoRef.current?.pause();
    },
    seek(time: number) {
      const element = videoRef.current;

      if (!element) {
        return;
      }

      element.currentTime = clamp(time, 0, Number.isFinite(element.duration) ? element.duration : time);
      timeStore.set(element.currentTime);
    },
    setRateMultiplier(multiplier: number) {
      const element = videoRef.current;
      rateMultiplierRef.current = multiplier;

      if (element) {
        element.playbackRate = baseRateRef.current * multiplier;
      }
    },
  }));
  const [isPlaying, setIsPlaying] = useState(false);
  // Keyed by URL so switching clips clears it without an effect.
  const [mediaError, setMediaError] = useState<{ url: string; problem: PlaybackProblem } | null>(
    null,
  );
  const playbackProblem: PlaybackProblem | null = !video
    ? null
    : !video.url || video.url.startsWith("indexeddb")
      ? "missing"
      : mediaError?.url === video.url
        ? mediaError.problem
        : null;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(video?.title ?? "");
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const node = mediaViewportRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => syncGroup.register(pane.id, media), [syncGroup, pane.id, media]);

  useEffect(() => {
    baseRateRef.current = pane.playbackRate;
    const element = videoRef.current;

    if (element) {
      element.defaultPlaybackRate = pane.playbackRate;
      element.playbackRate = pane.playbackRate * rateMultiplierRef.current;
    }
  }, [pane.playbackRate]);

  // While playing, report every presented frame: drives the playhead and follower correction.
  useEffect(() => {
    const element = videoRef.current;

    if (!isPlaying || !element) {
      return;
    }

    let cancelled = false;
    const report = (time: number) => {
      timeStore.set(time);
      syncGroup.onFrame(pane.id, time);
    };

    // Not in older Firefox/Safari; fall back to sampling currentTime each animation frame.
    if (typeof element.requestVideoFrameCallback === "function") {
      const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
        if (cancelled) {
          return;
        }

        report(metadata.mediaTime);
        handle = element.requestVideoFrameCallback(onFrame);
      };
      let handle = element.requestVideoFrameCallback(onFrame);

      return () => {
        cancelled = true;
        element.cancelVideoFrameCallback(handle);
      };
    }

    const onAnimationFrame = () => {
      if (cancelled) {
        return;
      }

      report(element.currentTime);
      handle = window.requestAnimationFrame(onAnimationFrame);
    };
    let handle = window.requestAnimationFrame(onAnimationFrame);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(handle);
    };
  }, [isPlaying, pane.id, syncGroup, timeStore]);

  // Legacy imports and samples have a guessed fps; measure it once in the background.
  const fpsDetectionAttemptedRef = useRef(new Set<string>());
  const needsFpsDetection = Boolean(
    video && !video.fpsSource && video.url && !video.url.startsWith("indexeddb"),
  );

  useEffect(() => {
    if (!video || !needsFpsDetection || fpsDetectionAttemptedRef.current.has(video.id)) {
      return;
    }

    fpsDetectionAttemptedRef.current.add(video.id);
    const videoId = video.id;

    void detectVideoFps(video.url).then((fps) => {
      if (fps) {
        onSetVideoFps(videoId, fps, "detected");
      }
    });
  }, [needsFpsDetection, onSetVideoFps, video]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setDraftTitle(video?.title ?? "");
      setIsRenaming(false);
    });
  }, [video?.id, video?.title]);

  const togglePlayback = () => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    if (element.paused) {
      syncGroup.play(pane.id);
    } else {
      syncGroup.pause(pane.id);
    }
  };

  const seekTo = (time: number) => {
    syncGroup.seek(pane.id, time);
  };

  const stepBy = (direction: -1 | 1) => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    if (!element.paused) {
      syncGroup.pause(pane.id);
    }

    seekTo(stepFrameTime(element.currentTime, video?.fps, direction, duration || element.duration || 0));
  };

  /** Saves the playhead into the session only when it comes to rest (not per frame). */
  const syncTimeFromElement = () => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    timeStore.set(element.currentTime);

    if (element.paused) {
      onUpdatePane(pane.id, { currentTime: Number(element.currentTime.toFixed(4)) });
    }
  };

  const stageAspectRatio = getVideoAspectRatio(video);
  const stageSize = getContainedStageSize(
    viewportSize.width,
    viewportSize.height,
    stageAspectRatio,
  );

  const canRenameVideo = Boolean(video);
  const userVideos = videos.filter((option) => option.sourceType !== "reference");
  const referenceVideos = videos.filter((option) => option.sourceType === "reference");

  const commitRename = () => {
    const nextTitle = draftTitle.trim();

    if (!video || !nextTitle) {
      setDraftTitle(video?.title ?? "");
      setIsRenaming(false);
      return;
    }

    if (nextTitle !== video.title) {
      onRenameVideo(video.id, nextTitle);
    }

    setIsRenaming(false);
  };
  const isZoomPanMode = activeTool === "zoom-pan";
  const canPan = isZoomPanMode && zoom > 1;
  const clampPan = (nextPan: { x: number; y: number }, nextZoom = zoom) => {
    const maxX = (stageSize.width * (nextZoom - 1)) / 2;
    const maxY = (stageSize.height * (nextZoom - 1)) / 2;

    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    };
  };

  const updateZoom = (nextZoom: number) => {
    const clampedZoom = Math.min(4, Math.max(1, Number(nextZoom.toFixed(2))));

    setZoom(clampedZoom);

    if (clampedZoom === 1) {
      setPan({ x: 0, y: 0 });
      return;
    }

    setPan((current) => clampPan(current, clampedZoom));
 };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!isZoomPanMode && !event.metaKey && !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPan) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) {
      return;
    }

    setPan(
      clampPan({
        x: panStartRef.current.panX + event.clientX - panStartRef.current.pointerX,
        y: panStartRef.current.panY + event.clientY - panStartRef.current.pointerY,
      }),
    );
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    panStartRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col transition",
        compareMode ? "border-y border-r first:border-l" : "border",
        isActive
          ? "border-[color:var(--color-accent)] bg-[#111214]"
          : "border-[color:var(--color-border)] bg-[#0d0e10]",
      )}
      onClick={() => onActivate(pane.id)}
    >
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[color:var(--color-border)] bg-[#141517] px-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2",
                isActive ? "bg-[color:var(--color-accent)]" : "bg-white/25",
              )}
            />
            {isRenaming && video ? (
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitRename();
                  }

                  if (event.key === "Escape") {
                    setDraftTitle(video.title);
                    setIsRenaming(false);
                  }
                }}
                className="h-7 min-w-48 border border-[color:var(--color-accent)] bg-black/60 px-2 text-xs font-medium text-white outline-none"
                autoFocus
                aria-label="Rename video"
              />
            ) : (
              <p className="truncate text-xs font-medium text-white">
                {getVideoLabel(video?.title)}
              </p>
            )}
            {canRenameVideo ? (
              <button
                type="button"
                onClick={() => {
                  if (isRenaming) {
                    commitRename();
                    return;
                  }

                  setDraftTitle(video?.title ?? "");
                  setIsRenaming(true);
                }}
                className="flex size-6 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
                title={isRenaming ? "Save name" : "Rename video"}
                aria-label={isRenaming ? "Save video name" : "Rename video"}
              >
                {isRenaming ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
              </button>
            ) : null}
            {compareMode && isComparisonPane ? (
              <span className="border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
                Compare
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            {video
              ? `${pane.label} / ${video.clubTag} / ${video.orientation}`
              : isComparisonPane
                ? "Choose a comparison source"
                : pane.label}
          </p>
        </div>

        <div className="flex min-w-fit items-center gap-2">
          <div className="hidden items-center gap-0.5 border border-[color:var(--color-border)] bg-black/25 p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => updateZoom(zoom - 0.25)}
              className="flex size-[26px] items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-9 text-center font-mono text-[10px] text-[color:var(--color-muted)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => updateZoom(zoom + 0.25)}
              className="flex size-[26px] items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="flex size-[26px] items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>

          <label className="border border-[color:var(--color-border)] px-2 py-1.5 text-xs text-white hover:border-[color:var(--color-accent)]">
            <span className="inline-flex items-center gap-2">
              <UploadCloud className="size-4" />
              <span className="hidden sm:inline">Upload</span>
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  onUploadVideo(pane.id, file);
                }
              }}
            />
          </label>

          <select
            value={pane.videoId ?? ""}
            onChange={(event) => onSelectVideo(pane.id, event.target.value)}
            className="max-w-40 border border-[color:var(--color-border)] bg-[#0b0c0e] px-2 py-1.5 text-xs text-white outline-none sm:max-w-52"
          >
            <option value="">Choose saved swing</option>
            <optgroup label="My swings">
              {userVideos.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </optgroup>
            {referenceVideos.length > 0 ? (
              <optgroup label="References">
                {referenceVideos.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        <div
          ref={mediaViewportRef}
          className={cn(
            "relative min-h-[240px] w-full flex-1 touch-none overflow-hidden bg-black",
            canPan ? "cursor-grab active:cursor-grabbing" : null,
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {video && playbackProblem ? (
            <div className="flex h-full items-center justify-center p-4">
              <PlaybackProblemNotice
                className="max-w-md"
                problem={playbackProblem}
                fileName={video.title}
                mimeType={video.mimeType}
              />
            </div>
          ) : video ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                // Video and Konva overlay are transformed together so normalized annotations stay
                // aligned; the canvas maps pointer positions back through this transform.
                className="relative overflow-hidden bg-black"
                style={{
                  width: `${stageSize.width}px`,
                  height: `${stageSize.height}px`,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
              >
                <video
                  ref={videoRef}
                  src={video.url}
                  className="h-full w-full object-contain"
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={() => {
                    const element = videoRef.current;
                    const nextDuration = element?.duration || video.duration || 0;

                    setDuration(nextDuration);

                    // Audio-only decode: the browser lacks the video codec (common for HEVC).
                    if (element && !element.videoWidth) {
                      setMediaError({ url: video.url, problem: "unsupported" });
                      return;
                    }

                    if (element) {
                      // Loading a source resets the rate; restore it and the saved position.
                      element.defaultPlaybackRate = baseRateRef.current;
                      element.playbackRate = baseRateRef.current * rateMultiplierRef.current;

                      if (pane.currentTime > 0 && pane.currentTime < nextDuration) {
                        element.currentTime = pane.currentTime;
                      }

                      timeStore.set(element.currentTime);
                    }

                    if (video.id) {
                      onVideoMetadata(video.id, {
                        duration: nextDuration,
                        width: element?.videoWidth || video.width,
                        height: element?.videoHeight || video.height,
                      });
                    }
                  }}
                  onSeeked={syncTimeFromElement}
                  onError={() =>
                    setMediaError({
                      url: video.url,
                      problem: classifyMediaError(videoRef.current?.error?.code),
                    })
                  }
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => {
                    setIsPlaying(false);
                    syncTimeFromElement();
                  }}
                  onEnded={() => syncGroup.onEnded(pane.id)}
                />

                <AnnotationCanvas
                  key={`${pane.id}-${video.id}-${video.width ?? 0}x${video.height ?? 0}`}
                  paneId={pane.id}
                  tool={activeTool}
                  color={activeColor}
                  annotations={annotations}
                  visible={pane.overlayVisible}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectionChange={(annotationId) => onSelectionChange(pane.id, annotationId)}
                  onChange={(next) => onAnnotationsChange(pane.id, next)}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[color:var(--color-muted)]">
              Load a swing clip
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[color:var(--color-border)] bg-[#141517] px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="flex size-8 shrink-0 items-center justify-center bg-[color:var(--color-accent)] text-[color:var(--color-ink)]"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>

            <button
              type="button"
              onClick={() => stepBy(-1)}
              className="flex size-8 shrink-0 items-center justify-center border border-[color:var(--color-border)] text-white hover:border-white/25"
              aria-label="Step back one frame"
            >
              <SkipBack className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => stepBy(1)}
              className="flex size-8 shrink-0 items-center justify-center border border-[color:var(--color-border)] text-white hover:border-white/25"
              aria-label="Step forward one frame"
            >
              <SkipForward className="size-4" />
            </button>

            <PlaybackTransport
              timeStore={timeStore}
              duration={duration}
              fps={video?.fps}
              markers={markers}
              onSeek={seekTo}
            />

            {video ? (
              <select
                value={video.fps ?? DEFAULT_FPS}
                onChange={(event) => onSetVideoFps(video.id, Number(event.target.value), "manual")}
                className="hidden h-8 border border-[color:var(--color-border)] bg-[#0b0c0e] px-1.5 font-mono text-xs text-white outline-none md:block"
                aria-label="Clip frame rate"
                title={
                  video.fpsSource === "detected"
                    ? "Frame rate (detected). Change it if frame stepping skips or repeats frames."
                    : "Frame rate. Set it to the clip's real rate for exact frame stepping."
                }
              >
                {frameRateChoices(video.fps).map((option) => (
                  <option key={option} value={option}>
                    {option} fps
                  </option>
                ))}
              </select>
            ) : null}

            <select
              value={pane.playbackRate}
              onChange={(event) => onChangeRate(pane.id, Number(event.target.value))}
              className="h-8 border border-[color:var(--color-border)] bg-[#0b0c0e] px-2 font-mono text-xs text-white outline-none"
              aria-label="Playback speed"
            >
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlaybackTransport({
  timeStore,
  duration,
  fps,
  markers,
  onSeek,
}: {
  timeStore: TimeStore;
  duration: number;
  fps?: number;
  markers: SnapshotMarker[];
  onSeek: (time: number) => void;
}) {
  const currentTime = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);

  return (
    <>
      <div className="min-w-0 flex-1 px-2">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={frameDuration(fps)}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none bg-white/15 accent-[color:var(--color-accent)]"
          aria-label="Scrub video"
        />
        <Timeline currentTime={currentTime} duration={duration} markers={markers} onSeek={onSeek} />
      </div>

      <p className="hidden min-w-32 text-right font-mono text-xs text-[color:var(--color-muted)] sm:block">
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
        <span className="ml-1.5 text-[10px] opacity-70">F{frameIndexAt(currentTime, fps)}</span>
      </p>
    </>
  );
}
