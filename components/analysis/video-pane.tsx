"use client";

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
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
import { frameStepForFps, shouldSyncToLeader } from "@/lib/analysis/sync";
import { getContainedStageSize, getVideoAspectRatio } from "@/lib/video-layout";
import type {
  AnalysisPane,
  AnnotationObject,
  AnnotationTool,
  HexColor,
  MarkerSeekSignal,
  PaneId,
  PlaybackSignal,
  SnapshotMarker,
  SyncSignal,
  VideoAsset,
} from "@/lib/types";
import { cn, formatDuration, getVideoLabel } from "@/lib/utils";

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
  syncEnabled: boolean;
  syncSignal: SyncSignal | null;
  playbackSignal: PlaybackSignal | null;
  markerSeekSignal: MarkerSeekSignal | null;
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
  onUpdatePane: (paneId: PaneId, patch: Partial<AnalysisPane>) => void;
  onEmitSync: (paneId: PaneId, time: number) => void;
  onEmitPlayback: (
    paneId: PaneId,
    command: Omit<PlaybackSignal, "paneId" | "version">,
  ) => void;
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
  syncEnabled,
  syncSignal,
  playbackSignal,
  markerSeekSignal,
  compareMode = false,
  isComparisonPane = false,
  onActivate,
  onSelectVideo,
  onUploadVideo,
  onVideoMetadata,
  onRenameVideo,
  onUpdatePane,
  onEmitSync,
  onEmitPlayback,
  onSelectionChange,
  onAnnotationsChange,
}: VideoPaneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaViewportRef = useRef<HTMLDivElement | null>(null);
  const suppressSyncEchoRef = useRef(false);
  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [duration, setDuration] = useState(video?.duration ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
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

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.playbackRate = pane.playbackRate;
  }, [pane.playbackRate]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setDraftTitle(video?.title ?? "");
      setIsRenaming(false);
    });
  }, [video?.id, video?.title]);

  useEffect(() => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    if (!syncEnabled || !syncSignal || syncSignal.paneId === pane.id) {
      return;
    }

    const next = shouldSyncToLeader(syncSignal.time, element.currentTime);

    if (next.shouldSeek) {
      suppressSyncEchoRef.current = true;
      element.currentTime = next.nextTime;
      onUpdatePane(pane.id, { currentTime: next.nextTime });
    }
  }, [syncEnabled, syncSignal, pane.id, onUpdatePane]);

  useEffect(() => {
    const element = videoRef.current;

    if (!element || !syncEnabled || !playbackSignal || playbackSignal.paneId === pane.id) {
      return;
    }

    if (playbackSignal.rate) {
      element.playbackRate = playbackSignal.rate;
      onUpdatePane(pane.id, { playbackRate: playbackSignal.rate });
    }

    if (typeof playbackSignal.time === "number") {
      suppressSyncEchoRef.current = true;
      element.currentTime = Math.max(0, Math.min(playbackSignal.time, duration || element.duration || 0));
      onUpdatePane(pane.id, { currentTime: element.currentTime });
    }

    if (playbackSignal.action === "play") {
      void element.play();
    }

    if (playbackSignal.action === "pause") {
      element.pause();
    }
  }, [duration, pane.id, playbackSignal, syncEnabled, onUpdatePane]);

  useEffect(() => {
    const element = videoRef.current;

    if (!element || !markerSeekSignal || markerSeekSignal.paneId !== pane.id) {
      return;
    }

    const nextTime = Math.max(0, Math.min(markerSeekSignal.time, duration || element.duration || 0));
    element.currentTime = nextTime;
    onUpdatePane(pane.id, { currentTime: nextTime });

    if (syncEnabled) {
      onEmitSync(pane.id, nextTime);
      onEmitPlayback(pane.id, {
        action: "seek",
        time: nextTime,
      });
    }
  }, [duration, markerSeekSignal, onEmitPlayback, onEmitSync, onUpdatePane, pane.id, syncEnabled]);

  const togglePlayback = async () => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    if (element.paused) {
      await element.play();
      setIsPlaying(true);
      if (syncEnabled) {
        onEmitPlayback(pane.id, {
          action: "play",
          time: element.currentTime,
          rate: pane.playbackRate,
        });
      }
      return;
    }

    element.pause();
    setIsPlaying(false);
    if (syncEnabled) {
      onEmitPlayback(pane.id, {
        action: "pause",
        time: element.currentTime,
        rate: pane.playbackRate,
      });
    }
  };

  const seekTo = (time: number) => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    element.currentTime = Math.max(0, Math.min(time, duration));
    onUpdatePane(pane.id, { currentTime: element.currentTime });

    if (syncEnabled) {
      onEmitSync(pane.id, element.currentTime);
      onEmitPlayback(pane.id, {
        action: "seek",
        time: element.currentTime,
      });
    }
  };

  const stepBy = (direction: -1 | 1) => {
    const increment = frameStepForFps(video?.fps);
    seekTo((videoRef.current?.currentTime ?? 0) + increment * direction);
  };

  const handleTimeUpdate = () => {
    const element = videoRef.current;

    if (!element) {
      return;
    }

    const currentTime = element.currentTime;
    onUpdatePane(pane.id, { currentTime });

    if (suppressSyncEchoRef.current) {
      suppressSyncEchoRef.current = false;
      return;
    }

    if (syncEnabled) {
      onEmitSync(pane.id, currentTime);
    }
  };

  const stageAspectRatio = getVideoAspectRatio(video);
  const stageSize = getContainedStageSize(
    viewportSize.width,
    viewportSize.height,
    stageAspectRatio,
  );

  const handlePlaybackRateChange = (rate: number) => {
    onUpdatePane(pane.id, { playbackRate: rate });

    if (syncEnabled) {
      onEmitPlayback(pane.id, {
        action: "rate",
        rate,
      });
    }
  };
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
          {video ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                // Video and Konva overlay are transformed together so existing normalized
                // annotations stay visually aligned. New drawings should be made at 100% zoom
                // for precise pointer-to-canvas coordinates.
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

                    if (video.id) {
                      onVideoMetadata(video.id, {
                        duration: nextDuration,
                        width: element?.videoWidth || video.width,
                        height: element?.videoHeight || video.height,
                      });
                    }
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
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

            <div className="min-w-0 flex-1 px-2">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(pane.currentTime, duration || 0)}
                onChange={(event) => seekTo(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none bg-white/15 accent-[color:var(--color-accent)]"
                aria-label="Scrub video"
              />
              <Timeline
                currentTime={pane.currentTime}
                duration={duration}
                markers={markers}
                onSeek={seekTo}
              />
            </div>

            <p className="hidden min-w-24 text-right font-mono text-xs text-[color:var(--color-muted)] sm:block">
              {formatDuration(pane.currentTime)} / {formatDuration(duration)}
            </p>

            <select
              value={pane.playbackRate}
              onChange={(event) => handlePlaybackRateChange(Number(event.target.value))}
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
