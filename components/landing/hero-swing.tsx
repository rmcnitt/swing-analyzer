"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PoseOverlay } from "@/components/analysis/pose-overlay";
import { SwingCheckOverlay } from "@/components/analysis/swing-check";
import { cleanTrack } from "@/lib/pose/clean-track";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { poseTrackFromRecording, type PoseRecording } from "@/lib/pose/pose-recording";
import { buildCheckGuides, headMovement, swingTempo } from "@/lib/pose/swing-check";
import { detectSwingPhases } from "@/lib/pose/swing-positions";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { getContainedStageSize } from "@/lib/video-layout";
import { createTimeStore } from "@/lib/video/time-store";

const CLIP = "/samples/sample-face-on.mp4";
const RECORDING = "/samples/sample-face-on.pose.json";
/** The sample clip is 720×1280. */
const ASPECT = 720 / 1280;
const RATE = 0.5;
const POSITIONS = ["Address", "Top", "Impact", "Finish"] as const;

/**
 * The landing page's hero: the sample swing looping in a workspace pane, with the real skeleton
 * and head-check overlays drawn from a pose track recorded off the same clip (no model download).
 * With reduced motion it holds still at the top of the swing.
 */
export function HeroSwing({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [timeStore] = useState(() => createTimeStore());
  const [track, setTrack] = useState<PoseTrack | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    let cancelled = false;

    fetch(RECORDING)
      .then((response) => response.json() as Promise<PoseRecording>)
      .then((recording) => {
        if (!cancelled) {
          setTrack(cleanTrack(poseTrackFromRecording(recording)));
        }
      })
      .catch(() => {
        // The clip still plays without overlays.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = areaRef.current;

    if (!node) {
      return;
    }

    const update = () => setArea({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const swing = useMemo(() => {
    const phases = track ? detectSwingPhases(track, ASPECT) : null;

    if (!track || !phases) {
      return null;
    }

    const times = { address: phases.Address, top: phases.Top, impact: phases.Impact };
    return {
      phases,
      guides: buildCheckGuides(track, times, ASPECT),
      tempo: swingTempo({ start: phases.motionStart, top: phases.Top, impact: phases.Impact }),
      head: headMovement(track, times, ASPECT),
    };
  }, [track]);

  // Follow the playhead every frame, the way a workspace pane does.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    let handle = 0;
    const withFrames = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const tick = () => {
      timeStore.set(video.currentTime);
      handle = withFrames.requestVideoFrameCallback
        ? withFrames.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };

    tick();
    return () => {
      if (withFrames.cancelVideoFrameCallback) {
        withFrames.cancelVideoFrameCallback(handle);
      } else {
        cancelAnimationFrame(handle);
      }
    };
  }, [timeStore]);

  // Reduced motion: hold at the top of the swing instead of looping.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (reducedMotion) {
      video.pause();

      if (swing?.phases.Top !== undefined) {
        video.currentTime = swing.phases.Top;
      }
    } else {
      void video.play().catch(() => {});
    }
  }, [reducedMotion, swing]);

  const stage = getContainedStageSize(area.width, area.height, ASPECT);

  return (
    <figure
      className={cn("flex flex-col overflow-hidden rounded-panel border border-border bg-surface-1", className)}
      aria-label="The sample swing, with the pose skeleton and head check drawn over it"
    >
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="size-2 bg-accent" aria-hidden />
          <span className="text-xs font-medium text-text">Sample swing (face-on)</span>
        </div>
        <span className="font-mono text-xs text-text-muted">{RATE}x</span>
      </div>

      <div ref={areaRef} className="relative min-h-0 flex-1 bg-bg">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: stage.width, height: stage.height }}>
            <video
              ref={videoRef}
              src={CLIP}
              className="h-full w-full object-contain"
              muted
              loop
              playsInline
              autoPlay={!reducedMotion}
              preload="auto"
              onLoadedMetadata={(event) => {
                event.currentTarget.playbackRate = RATE;
              }}
            />
            {track && stage.width > 0 ? (
              <PoseOverlay track={track} timeStore={timeStore} width={stage.width} height={stage.height} />
            ) : null}
            {track && swing && stage.width > 0 ? (
              <SwingCheckOverlay
                track={track}
                guides={swing.guides}
                visible={{ head: true }}
                timeStore={timeStore}
                width={stage.width}
                height={stage.height}
              />
            ) : null}
          </div>
        </div>
      </div>

      <HeroTransport timeStore={timeStore} swing={swing} duration={track?.duration ?? 0} />
    </figure>
  );
}

function HeroTransport({
  timeStore,
  swing,
  duration,
}: {
  duration: number;
  timeStore: ReturnType<typeof createTimeStore>;
  swing: {
    phases: Partial<Record<(typeof POSITIONS)[number], number>>;
    tempo: ReturnType<typeof swingTempo>;
    head: ReturnType<typeof headMovement>;
  } | null;
}) {
  const time = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);
  const at = (seconds: number) => `${duration > 0 ? Math.min((seconds / duration) * 100, 100) : 0}%`;
  const marked = POSITIONS.filter((label) => swing?.phases[label] !== undefined);
  // The latest position the playhead has passed.
  const current = [...marked].reverse().find((label) => (swing?.phases[label] ?? Infinity) <= time);
  const impact = swing?.head?.atImpact;

  return (
    <div className="border-t border-border px-3 py-2.5">
      <div className="relative h-4" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border" />
        <div
          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-text-muted"
          style={{ width: at(time) }}
        />
        {marked.map((label) => (
          <span
            key={label}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-text-muted"
            style={{ left: at(swing?.phases[label] ?? 0) }}
          />
        ))}
        <span
          className="absolute top-0 h-full w-0.5 bg-accent"
          style={{ left: at(time) }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex gap-1">
          {POSITIONS.map((label) => (
            <span
              key={label}
              className={cn(
                "flex h-7 items-center border px-2 font-mono text-xs",
                label === current
                  ? "border-accent bg-accent-dim text-text"
                  : marked.includes(label)
                    ? "border-border-strong text-text"
                    : "border-text-faint/60 text-text-muted",
              )}
            >
              {label}
            </span>
          ))}
        </div>

        <dl className="flex gap-4 font-mono text-xs">
          {swing?.tempo ? (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Tempo</dt>
              <dd className="text-text">
                {swing.tempo.ratio.toFixed(1)}
                <span className="text-text-faint">:1</span>
              </dd>
            </div>
          ) : null}
          {impact ? (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Head at impact</dt>
              <dd className="text-text">
                {Math.abs(impact.down).toFixed(1)}
                <span className="text-text-faint"> in {impact.down >= 0 ? "down" : "up"}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
