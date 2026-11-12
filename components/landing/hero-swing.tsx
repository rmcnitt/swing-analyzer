"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type RefObject,
} from "react";
import { Gauge, PersonStanding, Play, SkipBack, SkipForward } from "lucide-react";
import { PoseOverlay } from "@/components/analysis/pose-overlay";
import { SwingCheckOverlay } from "@/components/analysis/swing-check";
import { coverFraming } from "@/lib/analysis/framing";
import { getSampleSession } from "@/lib/data/seed";
import { HERO_LOOP, heroFrame, type CursorTarget, type HeroFrame } from "@/lib/landing/hero-script";
import { cleanTrack } from "@/lib/pose/clean-track";
import type { PoseTrack } from "@/lib/pose/landmarks";
import { poseTrackFromRecording, type PoseRecording } from "@/lib/pose/pose-recording";
import { buildCheckGuides, postureCheck, swingTempo } from "@/lib/pose/swing-check";
import { detectSwingPhases } from "@/lib/pose/swing-positions";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { getContainedStageSize } from "@/lib/video-layout";
import { createTimeStore, type TimeStore } from "@/lib/video/time-store";

const CLIP = "/samples/sample-down-the-line.mp4";
const RECORDING = "/samples/sample-down-the-line.pose.json";
/** The sample clip is 720×1280. */
const ASPECT = 720 / 1280;
const RATE = 0.5;
const POSITIONS = ["Address", "Top", "Impact", "Finish"] as const;
type Position = (typeof POSITIONS)[number];

/** The hand-placed marks of the sample "Try the sample swing" opens, so the two agree. */
const MARKS: Partial<Record<Position, number>> = Object.fromEntries(
  (getSampleSession("sample-session-dtl")?.snapshotMarkers ?? []).map((marker) => [marker.label, marker.time]),
);
const TIMES = { address: MARKS.Address, top: MARKS.Top, impact: MARKS.Impact };
/**
 * The part of this clip the hero frames: the golfer through the swing, leaving out the club that
 * pokes in at the right edge (normalized to the frame).
 */
const HERO_CROP = { x: 0.06, y: 0.25, width: 0.7, height: 0.53 };

const frameKey = (frame: HeroFrame) =>
  [frame.pose, frame.checks, frame.cursor.target, frame.cursor.visible, frame.cursor.clicking].join("|");

/**
 * The landing page's hero: the down-the-line sample swing in a workspace pane, framed on the golfer,
 * looping over the swing. A cursor turns on Pose (the skeleton) and then Swing checks (the posture
 * line), drawn from a pose track recorded off the same clip. Reduced motion holds still at Top with
 * both on.
 */
export function HeroSwing({ className }: { className?: string }) {
  const figureRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const poseRef = useRef<HTMLSpanElement | null>(null);
  const checksRef = useRef<HTMLSpanElement | null>(null);
  const [timeStore] = useState(() => createTimeStore());
  const [track, setTrack] = useState<PoseTrack | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Re-render only when the demo changes stage, not on every frame.
  const getKey = useCallback(
    () => frameKey(heroFrame(timeStore.get(), { reducedMotion })),
    [timeStore, reducedMotion],
  );
  const stageKey = useSyncExternalStore(timeStore.subscribe, getKey, getKey);
  const frame = heroFrame(timeStore.get(), { reducedMotion });

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
    if (!track) {
      return null;
    }

    const posture = postureCheck(track, TIMES, ASPECT);
    return {
      guides: buildCheckGuides(track, TIMES, ASPECT),
      tempo: swingTempo({
        start: detectSwingPhases(track, ASPECT)?.motionStart,
        top: TIMES.top,
        impact: TIMES.impact,
      }),
      spine: posture?.ok ? posture.value : null,
    };
  }, [track]);

  // Follow the playhead every frame, and loop over just the swing.
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
      if (!reducedMotion && video.currentTime >= HERO_LOOP.end) {
        video.currentTime = HERO_LOOP.start;
      }

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
  }, [timeStore, reducedMotion]);

  // Reduced motion: hold at the top of the swing instead of looping.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (reducedMotion) {
      video.pause();
      video.currentTime = MARKS.Top ?? HERO_LOOP.start;
    } else {
      void video.play().catch(() => {});
    }
  }, [reducedMotion]);

  const stage = getContainedStageSize(area.width, area.height, ASPECT);
  // Filled edge to edge (no empty margins), framed on the golfer.
  const framing = coverFraming(HERO_CROP, stage, area);

  return (
    <figure
      ref={figureRef}
      data-stage={stageKey}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-panel border border-border bg-surface-1",
        className,
      )}
      aria-label="Demo: the sample swing, with Pose and then the posture check turned on"
    >
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="size-2 bg-accent" aria-hidden />
          <span className="text-sm font-medium text-text">Sample swing (down-the-line)</span>
        </div>
        <span className="font-mono text-xs text-text-muted">{RATE}x</span>
      </div>

      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        {/* The framing is fixed, so the video can show at once, before the pose recording loads. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative"
            style={{
              width: stage.width,
              height: stage.height,
              transform: `translate(${framing.pan.x}px, ${framing.pan.y}px) scale(${framing.zoom})`,
              transformOrigin: "center center",
            }}
          >
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

                if (!reducedMotion) {
                  event.currentTarget.currentTime = HERO_LOOP.start;
                }
              }}
            />
            {track && frame.pose && stage.width > 0 ? (
              <PoseOverlay track={track} timeStore={timeStore} width={stage.width} height={stage.height} />
            ) : null}
            {track && swing && frame.checks && stage.width > 0 ? (
              <SwingCheckOverlay
                track={track}
                guides={swing.guides}
                visible={{ posture: true }}
                timeStore={timeStore}
                width={stage.width}
                height={stage.height}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2.5">
        <HeroTimeline timeStore={timeStore} />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {/* Look-alikes of the pane's controls for the demo cursor; not interactive. */}
          <div className="flex items-center gap-1" aria-hidden>
            <FakeControl icon={Play} />
            <FakeControl icon={SkipBack} />
            <FakeControl icon={SkipForward} />
            <FakeControl ref={poseRef} icon={PersonStanding} on={frame.pose} />
            <FakeControl ref={checksRef} icon={Gauge} on={frame.checks} />
          </div>
          <HeroChips timeStore={timeStore} />
        </div>

        <dl
          className={cn(
            "mt-2 flex gap-4 font-mono text-sm transition-opacity duration-200",
            frame.checks ? "opacity-100" : "opacity-0",
          )}
        >
          {swing?.tempo ? (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Tempo</dt>
              <dd className="text-text">
                {swing.tempo.ratio.toFixed(1)}
                <span className="text-text-muted">:1</span>
              </dd>
            </div>
          ) : null}
          {swing?.spine?.address !== undefined && swing.spine.impact !== undefined ? (
            <div className="flex gap-1.5">
              <dt className="text-text-muted">Spine</dt>
              <dd className="text-text">
                {Math.round(swing.spine.address)}
                <span className="text-text-muted">°</span> → {Math.round(swing.spine.impact)}
                <span className="text-text-muted">°</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <DemoCursor
        figureRef={figureRef}
        poseRef={poseRef}
        checksRef={checksRef}
        target={frame.cursor.target}
        visible={frame.cursor.visible}
        clicking={frame.cursor.clicking}
      />
    </figure>
  );
}

const FakeControl = forwardRef<HTMLSpanElement, { icon: ComponentType<{ className?: string }>; on?: boolean }>(
  function FakeControl({ icon: Icon, on = false }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "flex size-8 items-center justify-center rounded-control border transition-colors duration-150",
          on ? "border-accent bg-accent-dim text-text" : "border-border text-text-muted",
        )}
      >
        <Icon className="size-4" />
      </span>
    );
  },
);

/** A pointer that glides between the demo's controls and presses them. */
function DemoCursor({
  figureRef,
  poseRef,
  checksRef,
  target,
  visible,
  clicking,
}: {
  figureRef: RefObject<HTMLElement | null>;
  poseRef: RefObject<HTMLSpanElement | null>;
  checksRef: RefObject<HTMLSpanElement | null>;
  target: CursorTarget;
  visible: boolean;
  clicking: boolean;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  // Measured from the controls, so it lands on them at any hero size.
  useLayoutEffect(() => {
    const figureNode = figureRef.current;

    const measure = () => {
      const figure = figureNode?.getBoundingClientRect();
      const element = (target === "checks" ? checksRef : poseRef).current?.getBoundingClientRect();

      if (!figure || !element) {
        return;
      }

      const x = element.left - figure.left + element.width * 0.55;
      const y = element.top - figure.top + element.height * 0.6;
      // Comes in from below and to the right of the Pose control.
      setPoint(target === "enter" ? { x: x + 70, y: Math.min(y + 60, figure.height - 4) } : { x, y });
    };

    measure();
    const observer = new ResizeObserver(measure);

    if (figureNode) {
      observer.observe(figureNode);
    }

    return () => observer.disconnect();
  }, [figureRef, poseRef, checksRef, target]);

  if (!point) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{
        transform: `translate(${point.x}px, ${point.y}px)`,
        opacity: visible ? 1 : 0,
        transition: "transform 340ms var(--ease-out), opacity 200ms ease-out",
      }}
    >
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
        style={{
          transform: `scale(${clicking ? 0.82 : 1})`,
          transformOrigin: "2px 2px",
          transition: "transform 90ms ease-out",
        }}
      >
        <path
          d="M2 2 L2 18 L6.5 13.8 L9.6 20.4 L12.4 19.1 L9.4 12.6 L15.4 12.6 Z"
          className="fill-text stroke-bg"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function HeroTimeline({ timeStore }: { timeStore: TimeStore }) {
  const time = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);
  const span = HERO_LOOP.end - HERO_LOOP.start;
  const at = (seconds: number) => `${Math.min(Math.max((seconds - HERO_LOOP.start) / span, 0), 1) * 100}%`;

  return (
    <div className="relative h-4" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border" />
      <div className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-text-muted" style={{ width: at(time) }} />
      {POSITIONS.map((label) => {
        const mark = MARKS[label];
        return mark === undefined ? null : (
          <span
            key={label}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-text-muted"
            style={{ left: at(mark) }}
          />
        );
      })}
      <span className="absolute top-0 h-full w-0.5 bg-accent" style={{ left: at(time) }} />
    </div>
  );
}

function HeroChips({ timeStore }: { timeStore: TimeStore }) {
  // The latest position the playhead has passed; re-renders only when that changes.
  const current = useSyncExternalStore(
    timeStore.subscribe,
    () => [...POSITIONS].reverse().find((label) => (MARKS[label] ?? Infinity) <= timeStore.get()) ?? "",
    () => "",
  );

  return (
    <div className="flex gap-1" aria-hidden>
      {POSITIONS.map((label) => (
        <span
          key={label}
          className={cn(
            "flex h-7 items-center border px-2 font-mono text-xs",
            label === current ? "border-accent bg-accent-dim text-text" : "border-border-strong text-text",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
