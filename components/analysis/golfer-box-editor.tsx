"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { rectFromPoints } from "@/lib/analysis/framing";
import type { NormalizedRect, Point } from "@/lib/types";

interface GolferBoxEditorProps {
  initialBox?: NormalizedRect;
  onCommit: (box: NormalizedRect) => void;
  onCancel: () => void;
}

/** Boxes smaller than this (fraction of the frame) are treated as stray clicks. */
const MIN_SIZE = 0.04;

/** Overlay on the video stage for dragging a box around the golfer (head to feet). */
export function GolferBoxEditor({ initialBox, onCommit, onCancel }: GolferBoxEditorProps) {
  const startRef = useRef<Point | null>(null);
  const [draft, setDraft] = useState<NormalizedRect | null>(initialBox ?? null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    // Capture phase so Escape cancels here before the workspace treats it as "deselect".
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  /** Normalized position in the frame (getBoundingClientRect includes any zoom transform). */
  const toPoint = (event: PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  return (
    <div
      className="absolute inset-0 z-20 cursor-crosshair touch-none"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        startRef.current = toPoint(event);
        setDragging(true);
        setDraft(rectFromPoints(startRef.current, startRef.current));
      }}
      onPointerMove={(event) => {
        if (startRef.current) {
          setDraft(rectFromPoints(startRef.current, toPoint(event)));
        }
      }}
      onPointerUp={(event) => {
        const start = startRef.current;
        startRef.current = null;
        setDragging(false);

        if (!start) {
          return;
        }

        const box = rectFromPoints(start, toPoint(event));

        if (box.width >= MIN_SIZE && box.height >= MIN_SIZE) {
          onCommit(box);
        } else {
          setDraft(initialBox ?? null);
        }
      }}
      onPointerCancel={() => {
        startRef.current = null;
        setDragging(false);
        setDraft(initialBox ?? null);
      }}
    >
      {draft ? (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-[color:var(--color-accent)]"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.width * 100}%`,
            height: `${draft.height * 100}%`,
            // Dim everything outside the box.
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
      )}

      {!dragging ? (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-black/75 px-2.5 py-1.5 text-xs text-white">
          <span>Drag a box around the golfer, head to feet</span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCancel}
            className="border border-white/20 px-2 py-0.5 text-[11px] hover:border-white/40"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
