"use client";

import { useEffect, useRef } from "react";
import { Gauge, X } from "lucide-react";
import { drawSwingTraces, TRACE_COLORS, type TraceVisibility } from "@/lib/pose/draw-traces";
import type { PoseState } from "@/lib/pose/pose-store";
import {
  describeHeadShift,
  TOUR_TEMPO,
  type HeadMovement,
  type SwingTraces,
  type Tempo,
} from "@/lib/pose/swing-check";
import { cn } from "@/lib/utils";

/** Hand path and head traces over the video; static, redrawn only when its inputs change. */
export function SwingTraceOverlay({
  traces,
  visible,
  width,
  height,
}: {
  traces: SwingTraces;
  visible: TraceVisibility;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { head } = visible;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || width <= 0 || height <= 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawSwingTraces(context, traces, { head }, width, height);
  }, [traces, head, width, height]);

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
  /** Pose ran but found no full swing. */
  noSwing: boolean;
}

interface SwingCheckCardProps {
  pose: PoseState;
  data: SwingCheckData | null;
  visible: TraceVisibility;
  onToggle: (trace: keyof TraceVisibility) => void;
  onAnalyze: () => void;
  onClose: () => void;
}

/**
 * The per-pane "Swing check": a slim strip along the bottom of the video (where the ground is,
 * so it doesn't cover the hands and head it describes) with tempo, head movement and the trace
 * toggles. Wraps onto more lines in narrow panes.
 */
export function SwingCheckCard({ pose, data, visible, onToggle, onAnalyze, onClose }: SwingCheckCardProps) {
  const muted = "text-[color:var(--color-muted)]";
  const label = "text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]";

  let body: React.ReactNode;

  if (pose.status === "analyzing") {
    body = (
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <span className={muted}>Analyzing swing… {Math.round(pose.progress * 100)}%</span>
        <div className="h-1 flex-1 bg-white/10">
          <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${pose.progress * 100}%` }} />
        </div>
      </div>
    );
  } else if (pose.status === "unknown" || pose.status === "checking") {
    body = <span className={muted}>Loading…</span>;
  } else if (pose.status !== "ready") {
    body = (
      <>
        <span className={muted}>
          {pose.status === "error" ? `Analysis failed${pose.error ? `: ${pose.error}` : ""}.` : "Not analyzed yet."}
        </span>
        <button
          type="button"
          onClick={onAnalyze}
          className="h-6 bg-[color:var(--color-accent)] px-2 text-[11px] font-medium text-[color:var(--color-ink)]"
        >
          {pose.status === "error" ? "Try again" : "Analyze swing"}
        </button>
      </>
    );
  } else if (!data || data.noSwing) {
    body = (
      <span className={muted}>No full swing found. Keep the whole golfer in view from address to finish.</span>
    );
  } else {
    const { tempo, head } = data;

    body = (
      <>
        <div className="flex items-baseline gap-1.5" title={`Backswing ÷ downswing. Tour players average about ${TOUR_TEMPO} : 1.`}>
          <span className={label}>Tempo</span>
          {tempo ? (
            <>
              <span className="font-mono text-[13px] text-white">{tempo.ratio.toFixed(1)} : 1</span>
              <span className={muted}>
                {tempo.backswing.toFixed(2)}s / {tempo.downswing.toFixed(2)}s
              </span>
            </>
          ) : (
            <span className={muted}>mark Top and Impact</span>
          )}
        </div>

        <div
          className="flex flex-wrap items-baseline gap-x-2"
          title="Head movement from Address. Approximate inches, scaled from the golfer's leg length."
        >
          <span className={label}>Head</span>
          {head && (head.atTop || head.atImpact) ? (
            <>
              {head.atTop ? (
                <span>
                  <span className={muted}>Top </span>
                  {describeHeadShift(head.atTop, head.view)}
                </span>
              ) : null}
              {head.atImpact ? (
                <span>
                  <span className={muted}>Impact </span>
                  {describeHeadShift(head.atImpact, head.view)}
                </span>
              ) : null}
            </>
          ) : (
            <span className={muted}>mark Address and Top or Impact</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <TraceToggle active={visible.head} onClick={() => onToggle("head")} label="Head">
            <span className="size-2 rounded-full border-2" style={{ borderColor: TRACE_COLORS.head }} />
          </TraceToggle>
        </div>
      </>
    );
  }

  return (
    <div
      className="absolute inset-x-2 bottom-2 z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 border border-white/10 bg-black/75 py-1.5 pl-2.5 pr-1 text-[11px] text-white shadow-lg backdrop-blur-sm"
      // Keep clicks here from panning or drawing on the video underneath.
      onPointerDown={(event) => event.stopPropagation()}
      role="region"
      aria-label="Swing check"
    >
      <Gauge className="size-3.5 shrink-0 text-[color:var(--color-accent)]" aria-label="Swing check" />
      {body}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center hover:bg-white/[0.08] hover:text-white",
          muted,
          pose.status === "ready" && data && !data.noSwing ? null : "ml-auto",
        )}
        aria-label="Close swing check"
        title="Close swing check"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function TraceToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-6 items-center gap-1 border px-1.5 text-[10px] pointer-coarse:h-9",
        active
          ? "border-white/25 text-white"
          : "border-white/10 text-[color:var(--color-muted)] opacity-60 hover:opacity-100",
      )}
      title={active ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
    >
      <span className="flex items-center">{children}</span>
      {label}
    </button>
  );
}
