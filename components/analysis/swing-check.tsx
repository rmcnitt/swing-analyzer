"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronUp, Gauge, Pencil, X } from "lucide-react";
import { drawSwingChecks, type CheckVisibility } from "@/lib/pose/draw-checks";
import { frameIndexNear, type PoseTrack } from "@/lib/pose/landmarks";
import type { PoseState } from "@/lib/pose/pose-store";
import {
  clampHeight,
  describeHeadShift,
  formatHeight,
  headWithinTolerance,
  isCheckOn,
  postureWithinTolerance,
  SWING_CHECKS,
  TOUR_TEMPO,
  CHECK_TOLERANCES,
  type CheckGuides,
  type HeadMovement,
  type Posture,
  type Tempo,
  type ViewGated,
} from "@/lib/pose/swing-check";
import type { SwingCheckId } from "@/lib/types";
import type { TimeStore } from "@/lib/video/time-store";
import { cn } from "@/lib/utils";

interface SwingCheckOverlayProps {
  track: PoseTrack;
  guides: CheckGuides;
  visible: CheckVisibility;
  timeStore: TimeStore;
  width: number;
  height: number;
}

/**
 * The switched-on checks drawn over the video inside the zoom/pan transform. Fixed guides (e.g. the
 * Address head ring) plus live parts that follow the playhead without re-rendering React.
 */
export function SwingCheckOverlay({ track, guides, visible, timeStore, width, height }: SwingCheckOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || width <= 0 || height <= 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    let lastIndex = -2;

    const draw = () => {
      const index = frameIndexNear(track, timeStore.get());

      if (index === lastIndex) {
        return;
      }

      lastIndex = index;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawSwingChecks(context, track, index, guides, visible, width, height);
    };

    draw();
    return timeStore.subscribe(draw);
  }, [track, guides, visible, timeStore, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}

export interface SwingCheckData {
  tempo: Tempo | null;
  head: HeadMovement | null;
  posture: ViewGated<Posture> | null;
  /** Pose ran but found no full swing. */
  noSwing: boolean;
}

export interface GolferHeight {
  inches: number;
  /** Profile height (my swings) or this clip's golfer (references). */
  scope: "profile" | "clip";
}

const JUMPS = [
  ["Address", "address"],
  ["Top", "top"],
  ["Impact", "impact"],
] as const;

interface SwingChecksPanelProps {
  pose: PoseState;
  data: SwingCheckData | null;
  checks: Partial<Record<SwingCheckId, boolean>> | undefined;
  /** Marked or detected position times for the jump bar. */
  positions: ReadonlyMap<string, number>;
  timeStore: TimeStore;
  /** Half a frame, for highlighting the position the playhead is on. */
  frameTolerance: number;
  height: GolferHeight;
  onToggleCheck: (id: SwingCheckId) => void;
  onJump: (label: string) => void;
  onSetHeight: (inches: number) => void;
  onAnalyze: () => void;
  onClose: () => void;
}

const muted = "text-[color:var(--color-muted)]";
const good = "text-emerald-300";
const warn = "text-amber-300";

/**
 * The per-pane "Swing checks" panel: a compact card in the top-left of the video (usually sky or
 * background) with a jump bar to the positions that matter and a switch per check. Switched-off
 * checks shrink to one dim line and draw nothing on the video.
 */
export function SwingChecksPanel({
  pose,
  data,
  checks,
  positions,
  timeStore,
  frameTolerance,
  height,
  onToggleCheck,
  onJump,
  onSetHeight,
  onAnalyze,
  onClose,
}: SwingChecksPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const time = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);
  const ready = pose.status === "ready" && data && !data.noSwing;

  let body: React.ReactNode = null;

  if (pose.status === "analyzing") {
    body = (
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className={muted}>Analyzing swing… {Math.round(pose.progress * 100)}%</span>
        <div className="h-1 flex-1 bg-white/10">
          <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${pose.progress * 100}%` }} />
        </div>
      </div>
    );
  } else if (pose.status === "unknown" || pose.status === "checking") {
    body = <p className={cn("px-2.5 py-2", muted)}>Loading…</p>;
  } else if (pose.status !== "ready") {
    body = (
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className={muted}>
          {pose.status === "error" ? `Analysis failed${pose.error ? `: ${pose.error}` : ""}.` : "Not analyzed yet."}
        </span>
        <button
          type="button"
          onClick={onAnalyze}
          className="ml-auto h-6 shrink-0 bg-[color:var(--color-accent)] px-2 text-[12px] font-medium text-[color:var(--color-ink)]"
        >
          {pose.status === "error" ? "Try again" : "Analyze swing"}
        </button>
      </div>
    );
  } else if (!ready) {
    body = (
      <p className={cn("px-2.5 py-2", muted)}>
        No full swing found. Keep the whole golfer in view from address to finish.
      </p>
    );
  } else {
    const on = (id: SwingCheckId) => isCheckOn(checks, id);
    const usesInches = on("head");

    body = (
      <>
        <div className="flex border-b border-white/10" role="group" aria-label="Jump to position">
          {JUMPS.map(([label, key]) => {
            const at = positions.get(key);
            const current = at !== undefined && Math.abs(time - at) <= frameTolerance;

            return (
              <button
                key={key}
                type="button"
                disabled={at === undefined}
                onClick={() => onJump(label)}
                aria-pressed={current}
                className={cn(
                  "h-8 flex-1 text-[12px] pointer-coarse:h-9 disabled:opacity-35",
                  current
                    ? "bg-[color:var(--color-accent)] font-medium text-[color:var(--color-ink)]"
                    : "text-white/80 hover:bg-white/[0.08] hover:text-white",
                )}
                title={at === undefined ? `Mark ${label} first` : `Jump to ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <ul className="divide-y divide-white/[0.06]">
          {SWING_CHECKS.map((check) => (
            <CheckRow key={check.id} label={check.label} on={on(check.id)} onToggle={() => onToggleCheck(check.id)}>
              {check.id === "tempo" ? <TempoValue tempo={data.tempo} /> : null}
              {check.id === "head" ? <HeadValue head={data.head} /> : null}
              {check.id === "posture" ? (
                <DownTheLine result={data.posture} missing="Mark Address">
                  {(posture) => <PostureValue posture={posture} />}
                </DownTheLine>
              ) : null}
            </CheckRow>
          ))}
        </ul>

        {usesInches ? <HeightField height={height} onSetHeight={onSetHeight} /> : null}
      </>
    );
  }

  return (
    <div
      className="absolute left-2 top-2 z-10 w-[min(16rem,calc(100%-1rem))] border border-white/10 bg-black/75 text-[12px] text-white shadow-lg backdrop-blur-sm"
      // Keep clicks here from panning or drawing on the video underneath.
      onPointerDown={(event) => event.stopPropagation()}
      role="region"
      aria-label="Swing checks"
    >
      <div className="flex items-center gap-1.5 py-1 pl-2.5 pr-1">
        <Gauge className="size-3.5 shrink-0 text-[color:var(--color-accent)]" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]">Swing checks</span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={cn("ml-auto flex size-6 items-center justify-center hover:bg-white/[0.08] hover:text-white", muted)}
          aria-label={collapsed ? "Expand swing checks" : "Collapse swing checks"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn("flex size-6 items-center justify-center hover:bg-white/[0.08] hover:text-white", muted)}
          aria-label="Close swing checks"
          title="Close swing checks"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {collapsed ? null : <div className="border-t border-white/10">{body}</div>}
    </div>
  );
}

function CheckRow({
  label,
  on,
  onToggle,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 px-2.5 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="flex w-[4.3rem] shrink-0 items-center gap-1.5 text-left pointer-coarse:min-h-9"
        title={on ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      >
        <span
          className={cn(
            "relative h-3 w-5 shrink-0 rounded-full transition-colors",
            on ? "bg-[color:var(--color-accent)]" : "bg-white/15",
          )}
          aria-hidden
        >
          <span
            className={cn(
              "absolute top-0.5 size-2 rounded-full bg-white transition-[left]",
              on ? "left-2.5" : "left-0.5",
            )}
          />
        </span>
        <span className={on ? "text-white" : muted}>{label}</span>
      </button>
      {on ? <div className="min-w-0 flex-1 leading-[18px]">{children}</div> : null}
    </li>
  );
}

function TempoValue({ tempo }: { tempo: Tempo | null }) {
  if (!tempo) {
    return <span className={muted}>Mark Top and Impact</span>;
  }

  return (
    <span title={`Backswing ÷ downswing. Tour players average about ${TOUR_TEMPO} : 1.`}>
      <span className="font-mono text-[13px]">{tempo.ratio.toFixed(1)}:1</span>{" "}
      <span className={muted}>
        {tempo.backswing.toFixed(2)} / {tempo.downswing.toFixed(2)}s
      </span>
    </span>
  );
}

function HeadValue({ head }: { head: HeadMovement | null }) {
  if (!head || (!head.atTop && !head.atImpact)) {
    return <span className={muted}>Mark Address and Top or Impact</span>;
  }

  const rows = [
    ["Top", head.atTop],
    ["Impact", head.atImpact],
  ] as const;
  const title = [
    "Head movement from Address, in approximate inches (scaled from the golfer's height).",
    ...rows.flatMap(([label, shift]) => (shift ? [`${label}: ${describeHeadShift(shift, head.view)}`] : [])),
  ].join("\n");

  return (
    <div className={headWithinTolerance(head) ? good : warn} title={title}>
      {rows.map(([label, shift]) =>
        shift ? (
          <div key={label} className="whitespace-nowrap">
            <span className={cn("inline-block w-11", muted)}>{label}</span>
            {describeHeadShift(shift, head.view, { short: true })}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Shows a down-the-line check's value, or why there isn't one. */
function DownTheLine<T>({
  result,
  missing,
  children,
}: {
  result: ViewGated<T> | null;
  missing: string;
  children: (value: T) => React.ReactNode;
}) {
  if (!result) {
    return <span className={muted}>{missing}</span>;
  }

  if (!result.ok) {
    return (
      <span className={muted} title="Filmed from behind the golfer, looking down the target line.">
        Needs a down-the-line video
      </span>
    );
  }

  return children(result.value);
}

const degrees = (angle?: number) => (angle === undefined ? "—" : `${Math.round(angle)}°`);

function PostureValue({ posture }: { posture: Posture }) {
  if (posture.address === undefined) {
    return <span className={muted}>Torso not clear at Address</span>;
  }

  // Report the position where the spine angle changed most.
  const changes = (
    [
      ["Top", posture.top],
      ["Impact", posture.impact],
    ] as const
  ).flatMap(([label, angle]) => (angle === undefined ? [] : [{ label, change: angle - posture.address! }]));
  const biggest = changes.reduce<(typeof changes)[number] | undefined>(
    (best, item) => (!best || Math.abs(item.change) > Math.abs(best.change) ? item : best),
    undefined,
  );
  const held = postureWithinTolerance(posture);

  return (
    <div title="Spine angle above the ground (hip middle to shoulder middle) at Address → Top → Impact.">
      <div className="font-mono text-[12px]">
        {degrees(posture.address)} → {degrees(posture.top)} → {degrees(posture.impact)}
      </div>
      {biggest ? (
        <div className={held ? good : warn}>
          {held
            ? `Held within ${CHECK_TOLERANCES.postureDegrees}°`
            : `${biggest.change > 0 ? "Stood up" : "Bent over"} ${Math.abs(Math.round(biggest.change))}° by ${biggest.label}`}
        </div>
      ) : null}
    </div>
  );
}

function HeightField({ height, onSetHeight }: { height: GolferHeight; onSetHeight: (inches: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const who = height.scope === "profile" ? "Your height" : "Golfer height";

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setFeet(String(Math.floor(height.inches / 12)));
          setInches(String(Math.round(height.inches) % 12));
          setEditing(true);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 border-t border-white/10 px-2.5 py-1.5 text-left hover:text-white pointer-coarse:min-h-9",
          muted,
        )}
        title={
          height.scope === "profile"
            ? "Used for all your swings, to turn movement into inches"
            : "This clip's golfer, to turn movement into inches"
        }
      >
        {who} <span className="text-white">{formatHeight(height.inches)}</span>
        <Pencil className="size-3" aria-hidden />
      </button>
    );
  }

  const save = () => {
    const total = Number(feet) * 12 + Number(inches || 0);

    if (Number.isFinite(total) && total > 0) {
      onSetHeight(clampHeight(total));
    }

    setEditing(false);
  };
  const field =
    "h-6 w-9 border border-white/15 bg-black/60 px-1 text-center text-[12px] text-white outline-none focus:border-[color:var(--color-accent)] pointer-coarse:h-9";

  return (
    <form
      className="flex items-center gap-1 border-t border-white/10 px-2.5 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setEditing(false);
        }

        // Typing digits here shouldn't trigger the workspace's keyboard shortcuts.
        event.stopPropagation();
      }}
    >
      <span className={cn("mr-1", muted)}>{who}</span>
      <input
        aria-label="Feet"
        inputMode="numeric"
        value={feet}
        onChange={(event) => setFeet(event.target.value.replace(/\D/g, "").slice(0, 1))}
        className={field}
        autoFocus
      />
      <span className={muted}>ft</span>
      <input
        aria-label="Inches"
        inputMode="numeric"
        value={inches}
        onChange={(event) => setInches(event.target.value.replace(/\D/g, "").slice(0, 2))}
        className={field}
      />
      <span className={muted}>in</span>
      <button
        type="submit"
        className="ml-auto flex size-6 items-center justify-center bg-[color:var(--color-accent)] text-[color:var(--color-ink)] pointer-coarse:size-9"
        aria-label="Save height"
      >
        <Check className="size-3.5" />
      </button>
    </form>
  );
}
