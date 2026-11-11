"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronUp, Gauge, GripHorizontal, Pencil, X } from "lucide-react";
import { drawSwingChecks, type CheckVisibility } from "@/lib/pose/draw-checks";
import { frameIndexNear, type PoseTrack } from "@/lib/pose/landmarks";
import type { PoseState } from "@/lib/pose/pose-store";
import {
  clampHeight,
  describeHeadShift,
  CHECK_TOLERANCES,
  extensionArrow,
  formatHeight,
  headShiftArrows,
  isCheckOn,
  shiftDistance,
  STEADY_INCHES,
  SWING_CHECKS,
  TOUR_TEMPO,
  type CheckGuides,
  type Extension,
  type HeadMovement,
  type LeadArm,
  type Posture,
  type Tempo,
  type ViewGated,
} from "@/lib/pose/swing-check";
import { CORNER_CLASSES, nearestCorner } from "@/lib/analysis/corner";
import type { PanelCorner, SwingCheckId } from "@/lib/types";
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
  extension: ViewGated<Extension> | null;
  leadArm: ViewGated<LeadArm> | null;
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
  corner: PanelCorner;
  onMoveCorner: (corner: PanelCorner) => void;
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
  corner,
  onMoveCorner,
  onToggleCheck,
  onJump,
  onSetHeight,
  onAnalyze,
  onClose,
}: SwingChecksPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // While dragging by the title bar: pointer start and current offset (px). Dropping snaps the
  // panel to the nearest corner of the video area.
  const [drag, setDrag] = useState<{ pointerId: number; startX: number; startY: number; dx: number; dy: number } | null>(
    null,
  );

  const endDrag = (event: React.PointerEvent) => {
    const panel = panelRef.current;
    const area = panel?.offsetParent;

    if (drag && panel && area && (Math.abs(drag.dx) > 4 || Math.abs(drag.dy) > 4)) {
      const box = panel.getBoundingClientRect();
      const bounds = area.getBoundingClientRect();
      onMoveCorner(
        nearestCorner(
          box.left + box.width / 2 - bounds.left,
          box.top + box.height / 2 - bounds.top,
          bounds.width,
          bounds.height,
        ),
      );
    }

    if (drag) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }

    setDrag(null);
  };
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
    const usesInches = on("head") || (on("extension") && data.extension?.ok);
    // Switched-on down-the-line checks on another camera angle fold into one note.
    const rows = SWING_CHECKS.map((check) => {
      const content = rowContent(check.id, data);
      return { check, content, folded: on(check.id) && "needsDownTheLine" in content };
    });
    const folded = rows.filter((row) => row.folded).map((row) => row.check.label);
    const current = JUMPS.find(([, key]) => {
      const at = positions.get(key);
      return at !== undefined && Math.abs(time - at) <= frameTolerance;
    })?.[1];

    body = (
      <>
        <div className={cn(GRID, "border-b border-white/10")} role="group" aria-label="Jump to position">
          <span className={cn("self-center pl-2.5 text-[10px] uppercase tracking-[0.12em]", muted)}>Jump to</span>
          {JUMPS.map(([label, key]) => {
            const at = positions.get(key);

            return (
              <button
                key={key}
                type="button"
                disabled={at === undefined}
                onClick={() => onJump(label)}
                aria-pressed={current === key}
                className={cn(
                  "h-8 text-[12px] pointer-coarse:h-9 disabled:opacity-35",
                  current === key
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
          {rows
            .filter(({ folded }) => !folded)
            .map(({ check, content }) => (
              <CheckRow
                key={check.id}
                label={check.label}
                on={on(check.id)}
                onToggle={() => onToggleCheck(check.id)}
                content={content}
                current={current}
              />
            ))}
        </ul>

        {folded.length > 0 ? (
          <p className={cn("border-t border-white/10 px-2.5 py-1.5 leading-4", muted)} title={DOWN_THE_LINE_TITLE}>
            {folded.join(", ")} {folded.length === 1 ? "needs" : "need"} a down-the-line video
          </p>
        ) : null}

        {usesInches ? <HeightField height={height} onSetHeight={onSetHeight} /> : null}
      </>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute z-10 w-[min(17rem,calc(100%-1rem))] border border-white/10 bg-black/75 text-[12px] text-white shadow-lg backdrop-blur-sm",
        CORNER_CLASSES[corner],
        drag ? "opacity-90 shadow-2xl" : null,
      )}
      style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
      // Keep clicks here from panning or drawing on the video underneath.
      onPointerDown={(event) => event.stopPropagation()}
      role="region"
      aria-label="Swing checks"
    >
      <div
        className={cn(
          "flex touch-none items-center gap-1.5 py-1 pl-2.5 pr-1",
          drag ? "cursor-grabbing" : "cursor-grab",
        )}
        title="Drag to move the panel to another corner"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 });
        }}
        onPointerMove={(event) => {
          if (drag?.pointerId === event.pointerId) {
            setDrag({ ...drag, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY });
          }
        }}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <Gauge className="size-3.5 shrink-0 text-[color:var(--color-accent)]" aria-hidden />
        <span className="select-none text-[11px] font-medium uppercase tracking-[0.14em]">Swing checks</span>
        <GripHorizontal className={cn("size-3.5", muted)} aria-hidden />
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

/** Label column, then Address / Top / Impact columns (shared by the jump bar and every row). */
const GRID = "grid grid-cols-[5.4rem_repeat(3,minmax(0,1fr))]";

interface Cell {
  /** Several parts stack onto separate lines (head: down and sideways). */
  text: string | string[];
  tone?: "good" | "warn" | "muted";
  title?: string;
}

/** A check's row: one cell per position, or one line across all three. */
type RowContent =
  | { cells: [Cell | null, Cell | null, Cell | null] }
  | { line: React.ReactNode; title?: string }
  /** A down-the-line check on a clip filmed from another angle. */
  | { needsDownTheLine: true };

const toneClass = { good, warn, muted } as const;

function CheckRow({
  label,
  on,
  onToggle,
  content,
  current,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  content: RowContent;
  current?: string;
}) {
  return (
    <li className={cn(GRID, "min-h-8 items-stretch pointer-coarse:min-h-10")}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="flex items-center gap-1.5 pl-2.5 text-left"
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
        <span className={cn("whitespace-nowrap", on ? "text-white" : muted)}>{label}</span>
      </button>
      {!on || "needsDownTheLine" in content ? null : "line" in content ? (
        <div className="col-span-3 flex items-center px-2 leading-4" title={content.title}>
          {content.line}
        </div>
      ) : (
        content.cells.map((cell, index) => (
          <div
            key={JUMPS[index][1]}
            className={cn(
              "flex flex-col items-center justify-center whitespace-nowrap px-0.5 py-1 text-center leading-[15px] tabular-nums",
              current === JUMPS[index][1] ? "bg-white/[0.06]" : null,
              cell?.tone ? toneClass[cell.tone] : null,
            )}
            title={cell?.title}
          >
            {typeof cell?.text === "string"
              ? cell.text
              : cell?.text.map((part) => <span key={part}>{part}</span>)}
          </div>
        ))
      )}
    </li>
  );
}

const DOWN_THE_LINE_TITLE = "Filmed from behind the golfer, looking down the target line.";
const degrees = (angle?: number) => (angle === undefined ? "—" : `${Math.round(angle)}°`);

/** Unwraps a down-the-line check, or says why there's nothing to show. */
function gated<T>(result: ViewGated<T> | null, missing: string, show: (value: T) => RowContent): RowContent {
  if (!result) {
    return { line: <span className={muted}>{missing}</span> };
  }

  if (!result.ok) {
    return { needsDownTheLine: true };
  }

  return show(result.value);
}

function rowContent(id: SwingCheckId, data: SwingCheckData): RowContent {
  switch (id) {
    case "tempo":
      return tempoRow(data.tempo);
    case "head":
      return headRow(data.head);
    case "posture":
      return gated(data.posture, "Mark Address", postureRow);
    case "extension":
      return gated(data.extension, "Mark Address", extensionRow);
    case "leadArm":
      return gated(data.leadArm, "Mark Address", leadArmRow);
    default:
      return { line: null };
  }
}

function tempoRow(tempo: Tempo | null): RowContent {
  if (!tempo) {
    return { line: <span className={muted}>Mark Top and Impact</span> };
  }

  return {
    title: `Backswing ÷ downswing (${tempo.backswing.toFixed(2)}s back, ${tempo.downswing.toFixed(2)}s down). Tour players average about ${TOUR_TEMPO} : 1.`,
    line: (
      <span>
        <span className="font-mono text-[13px]">{tempo.ratio.toFixed(1)} : 1</span>{" "}
        <span className={muted}>
          {tempo.backswing.toFixed(2)}s / {tempo.downswing.toFixed(2)}s
        </span>
      </span>
    ),
  };
}

function headRow(head: HeadMovement | null): RowContent {
  if (!head || (!head.atTop && !head.atImpact)) {
    return { line: <span className={muted}>Mark Address and Top or Impact</span> };
  }

  const cell = (label: string, shift: HeadMovement["atTop"]): Cell | null =>
    shift
      ? {
          text: headShiftArrows(shift, head.screenSign).split(" "),
          tone: shiftDistance(shift) <= CHECK_TOLERANCES.headInches ? "good" : "warn",
          title: `Head at ${label}: ${describeHeadShift(shift, head.view)} from Address (approximate inches). Within ${CHECK_TOLERANCES.headInches} in is steady.`,
        }
      : null;

  return {
    cells: [
      { text: "◌", tone: "muted", title: "The dashed circle marks your head at Address." },
      cell("Top", head.atTop),
      cell("Impact", head.atImpact),
    ],
  };
}

function postureRow(posture: Posture): RowContent {
  if (posture.address === undefined) {
    return { line: <span className={muted}>Torso not clear at Address</span> };
  }

  const cell = (label: string, angle?: number): Cell | null => {
    if (angle === undefined) {
      return { text: "—", tone: "muted", title: `Torso not clear at ${label}` };
    }

    const change = angle - posture.address!;
    const held = Math.abs(change) <= CHECK_TOLERANCES.postureDegrees;
    return {
      text: degrees(angle),
      tone: held ? "good" : "warn",
      title: held
        ? `Spine angle at ${label}: within ${CHECK_TOLERANCES.postureDegrees}° of Address.`
        : `Spine angle at ${label}: ${change > 0 ? "stood up" : "bent over"} ${Math.abs(Math.round(change))}° from Address.`,
    };
  };

  return {
    cells: [
      {
        text: degrees(posture.address),
        title: "Spine angle above the ground at Address (hip middle to shoulder middle).",
      },
      cell("Top", posture.top),
      cell("Impact", posture.impact),
    ],
  };
}

function leadArmRow(arm: LeadArm): RowContent {
  if (arm.atTop === undefined) {
    return { line: <span className={muted}>Mark Top (arm and shoulders must be clear)</span> };
  }

  const angle = Math.round(arm.atTop);
  const onPlane = Math.abs(arm.atTop) <= CHECK_TOLERANCES.leadArmDegrees;
  return {
    cells: [
      null,
      {
        text: angle === 0 ? "on plane" : `${Math.abs(angle)}° ${angle > 0 ? "above" : "below"}`,
        tone: onPlane ? "good" : "warn",
        title: `At the top, the lead (${arm.lead}) arm is ${
          angle === 0 ? "on" : `${Math.abs(angle)}° ${angle > 0 ? "above (steeper than)" : "below (flatter than)"}`
        } the shoulder plane. Within ${CHECK_TOLERANCES.leadArmDegrees}° counts as matching.`,
      },
      null,
    ],
  };
}

function extensionRow(extension: Extension): RowContent {
  if (extension.atTop === undefined && extension.atImpact === undefined) {
    return { line: <span className={muted}>Mark Top or Impact</span> };
  }

  const cell = (label: string, inches?: number): Cell | null => {
    if (inches === undefined) {
      return null;
    }

    const ok = inches <= CHECK_TOLERANCES.extensionInches;
    const where =
      Math.abs(inches) < STEADY_INCHES
        ? "on the line"
        : `${Math.abs(inches).toFixed(1)} in ${inches > 0 ? "toward the ball" : "behind the line"}`;
    return {
      text: extensionArrow(inches, extension.ballSide),
      tone: ok ? "good" : "warn",
      title: `Butt at ${label}: ${where} (approximate). More than ${CHECK_TOLERANCES.extensionInches} in toward the ball is early extension; on or behind the line is good.`,
    };
  };

  return {
    cells: [
      { text: "line", tone: "muted", title: "The dashed line marks your butt at Address." },
      cell("Top", extension.atTop),
      cell("Impact", extension.atImpact),
    ],
  };
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
