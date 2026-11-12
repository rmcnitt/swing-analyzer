"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, ChevronUp, Gauge, GripHorizontal, Pencil, X } from "lucide-react";
import { drawSwingChecks, type CheckVisibility } from "@/lib/pose/draw-checks";
import { analysisProgressText } from "@/lib/pose/analysis-progress";
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
  /** Clip length and frame rate, for "Analyzing frame 84 / 150". */
  duration?: number;
  fps?: number;
  /** Docked beside or below the video (where floating would cover the golfer) instead of floating. */
  docked?: "side" | "below";
  onMoveCorner: (corner: PanelCorner) => void;
  onToggleCheck: (id: SwingCheckId) => void;
  onJump: (label: string) => void;
  onSetHeight: (inches: number) => void;
  onAnalyze: () => void;
  onClose: () => void;
}

const muted = "text-text-muted";
/** A unit after a number: one step down the type scale (11px under 13px values), faint. */
const unitClass = "text-xs text-text-faint";

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
  duration,
  fps,
  docked,
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
      <p className={cn("px-2.5 py-2 font-mono", muted)}>
        {analysisProgressText(pose.progress, duration, fps)}
      </p>
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
          className="ml-auto h-6 shrink-0 bg-accent px-2 text-xs font-medium text-bg"
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
        <div className={cn(GRID, "border-b border-border")} role="group" aria-label="Jump to position">
          <span className={cn("self-center pl-2.5 text-xs uppercase tracking-caps", muted)}>Jump to</span>
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
                  "h-8 text-xs pointer-coarse:h-9 disabled:opacity-35",
                  current === key
                    ? "bg-accent-dim font-medium text-accent shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "text-text hover:bg-surface-2 hover:text-text",
                )}
                title={at === undefined ? `Mark ${label} first` : `Jump to ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <ul className="divide-y divide-border">
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
          <p className={cn("border-t border-border px-2.5 py-1.5 leading-4", muted)} title={DOWN_THE_LINE_TITLE}>
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
        "bg-surface-1 text-xs text-text",
        docked === "side"
          ? "w-72 shrink-0 self-start overflow-y-auto border-b border-l border-border max-h-full compact:w-64"
          : docked === "below"
            ? // Phone: the panel sits after the controls in a scrolling page, so it shows in full.
            "max-h-[45%] shrink-0 overflow-y-auto border-t border-border phone:max-h-none"
            : cn(
              "absolute z-10 w-[min(18rem,calc(100%-1rem))] overflow-hidden rounded-panel border border-border shadow-float",
              CORNER_CLASSES[corner],
              drag ? "opacity-90" : null,
            ),
      )}
      style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
      // Keep clicks here from panning or drawing on the video underneath.
      onPointerDown={(event) => event.stopPropagation()}
      role="region"
      aria-label="Swing checks"
    >
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 pl-2.5 pr-1",
          docked ? null : drag ? "touch-none cursor-grabbing" : "touch-none cursor-grab",
        )}
        title={docked ? undefined : "Drag to move the panel to another corner"}
        onPointerDown={(event) => {
          if (docked || (event.target as HTMLElement).closest("button")) {
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
        <Gauge className={cn("size-3.5 shrink-0", muted)} aria-hidden />
        <span className="select-none text-xs font-medium uppercase tracking-caps">Swing checks</span>
        {docked ? null : <GripHorizontal className={cn("size-3.5", muted)} aria-hidden />}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={cn("ml-auto flex size-6 items-center justify-center hover:bg-surface-2 hover:text-text", muted)}
          aria-label={collapsed ? "Expand swing checks" : "Collapse swing checks"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn("flex size-6 items-center justify-center hover:bg-surface-2 hover:text-text", muted)}
          aria-label="Close swing checks"
          title="Close swing checks"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {collapsed ? null : <div className="border-t border-border">{body}</div>}
    </div>
  );
}

/** Label column, then Address / Top / Impact columns (shared by the jump bar and every row). */
const GRID = "grid grid-cols-[5.25rem_repeat(3,minmax(0,1fr))]";

/** One line of a cell: a number (mono) and its unit (small, faint). Either may be empty. */
interface CellPart {
  value: string;
  unit?: string;
}

interface Cell {
  /** Parts stack onto separate lines (head: down and sideways). */
  parts?: CellPart[];
  /** In range (`good`) or past its `CHECK_TOLERANCES` limit (`warn`); none for reference values. */
  status?: "good" | "warn";
  /** A small key matching the dashed Address mark drawn on the video. */
  reference?: "ring" | "line";
  title?: string;
}

/** A check's row: one cell per position, or one line across all three. */
type RowContent =
  | { cells: [Cell | null, Cell | null, Cell | null] }
  | { line: React.ReactNode; title?: string }
  /** A down-the-line check on a clip filmed from another angle. */
  | { needsDownTheLine: true };

const statusClass = { good: "bg-good", warn: "bg-warn" } as const;

function CellView({ cell }: { cell: Cell }) {
  if (cell.reference) {
    return (
      <span
        aria-label="Address reference"
        className={cn(
          "border-text-muted",
          cell.reference === "ring" ? "size-3 rounded-full border border-dashed" : "h-4 border-l border-dashed",
        )}
      />
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", cell.status ? statusClass[cell.status] : null)}
        aria-label={cell.status === "warn" ? "Worth checking" : cell.status === "good" ? "In range" : undefined}
      />
      <span className="flex flex-col items-start">
        {cell.parts?.map((part, index) => (
          <span key={index} className="whitespace-nowrap">
            {part.value ? <span className="font-mono text-sm">{part.value}</span> : null}
            {part.unit ? (
              // A word on its own ("steady", "above") is the reading, not a unit: muted, not faint.
              <span className={part.value ? cn(unitClass, "ml-0.5") : cn("text-xs", muted)}>{part.unit}</span>
            ) : null}
          </span>
        ))}
      </span>
    </span>
  );
}

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
            on ? "bg-accent" : "bg-border-strong",
          )}
          aria-hidden
        >
          <span
            className={cn(
              "absolute top-0.5 size-2 rounded-full bg-text transition-[left]",
              on ? "left-2.5" : "left-0.5",
            )}
          />
        </span>
        <span className={cn("whitespace-nowrap", on ? "text-text" : muted)}>{label}</span>
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
              "flex items-center justify-center px-0.5 py-1 leading-4",
              current === JUMPS[index][1] ? "bg-surface-2" : null,
            )}
            title={cell?.title}
          >
            {cell ? <CellView cell={cell} /> : null}
          </div>
        ))
      )}
    </li>
  );
}

const DOWN_THE_LINE_TITLE = "Filmed from behind the golfer, looking down the target line.";
/** "↓1.8" → a value with an inch unit; words like "steady" or "on line" stand alone. */
const inchPart = (text: string): CellPart => (/\d/.test(text) ? { value: text, unit: "in" } : { value: "", unit: text });
const degreePart = (angle: number): CellPart => ({ value: String(Math.round(angle)), unit: "°" });

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
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        <span>
          <span className="font-mono text-sm">{tempo.ratio.toFixed(1)}</span>
          <span className={cn(unitClass, "ml-0.5")}>: 1</span>
        </span>
        <span className={cn("font-mono", muted)}>
          {tempo.backswing.toFixed(2)}
          <span className={unitClass}>s</span> / {tempo.downswing.toFixed(2)}
          <span className={unitClass}>s</span>
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
          parts: headShiftArrows(shift, head.screenSign).split(" ").map(inchPart),
          status: shiftDistance(shift) <= CHECK_TOLERANCES.headInches ? "good" : "warn",
          title: `Head at ${label}: ${describeHeadShift(shift, head.view)} from Address (approximate inches). Within ${CHECK_TOLERANCES.headInches} in is steady.`,
        }
      : null;

  return {
    cells: [
      { reference: "ring", title: "The dashed circle marks your head at Address." },
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
      return { parts: [{ value: "", unit: "—" }], title: `Torso not clear at ${label}` };
    }

    const change = angle - posture.address!;
    const held = Math.abs(change) <= CHECK_TOLERANCES.postureDegrees;
    return {
      parts: [degreePart(angle)],
      status: held ? "good" : "warn",
      title: held
        ? `Spine angle at ${label}: within ${CHECK_TOLERANCES.postureDegrees}° of Address.`
        : `Spine angle at ${label}: ${change > 0 ? "stood up" : "bent over"} ${Math.abs(Math.round(change))}° from Address.`,
    };
  };

  return {
    cells: [
      {
        parts: [degreePart(posture.address)],
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
        parts:
          angle === 0
            ? [{ value: "", unit: "on plane" }]
            : [{ value: String(Math.abs(angle)), unit: "°" }, { value: "", unit: angle > 0 ? "above" : "below" }],
        status: onPlane ? "good" : "warn",
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
      parts: [inchPart(extensionArrow(inches, extension.ballSide))],
      status: ok ? "good" : "warn",
      title: `Butt at ${label}: ${where} (approximate). More than ${CHECK_TOLERANCES.extensionInches} in toward the ball is early extension; on or behind the line is good.`,
    };
  };

  return {
    cells: [
      { reference: "line", title: "The dashed line marks your butt at Address." },
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
          "flex w-full items-center gap-1.5 border-t border-border px-2.5 py-1.5 text-left hover:text-text pointer-coarse:min-h-9",
          muted,
        )}
        title={
          height.scope === "profile"
            ? "Used for all your swings, to turn movement into inches"
            : "This clip's golfer, to turn movement into inches"
        }
      >
        {who} <span className="text-text">{formatHeight(height.inches)}</span>
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
    "h-6 w-9 border border-border bg-bg px-1 text-center text-xs text-text focus:border-border-strong pointer-coarse:h-9";

  return (
    <form
      className="flex items-center gap-1 border-t border-border px-2.5 py-1.5"
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
        className="ml-auto flex size-6 items-center justify-center bg-accent text-bg pointer-coarse:size-9"
        aria-label="Save height"
      >
        <Check className="size-3.5" />
      </button>
    </form>
  );
}
