"use client";

import {
  Circle,
  Eye,
  EyeOff,
  Hand,
  MousePointer2,
  MoveDiagonal,
  MoveUpRight,
  PenLine,
  RotateCcw,
  RotateCw,
  Ruler,
  Slash,
  Square,
  Trash2,
} from "lucide-react";
import { STROKE_WIDTHS } from "@/lib/analysis/annotations";
import { TOOL_HOTKEYS } from "@/lib/analysis/shortcuts";
import type { AnnotationTool, HexColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ANNOTATION_SWATCHES } from "@/lib/design/tokens";

const tools: Array<{
  id: AnnotationTool;
  label: string;
  icon: typeof MousePointer2;
}> = [
  { id: "select", label: "Move", icon: MousePointer2 },
  { id: "zoom-pan", label: "Zoom / Pan", icon: Hand },
  { id: "line", label: "Line", icon: Slash },
  { id: "arrow", label: "Arrow", icon: MoveUpRight },
  { id: "plane", label: "Plane line", icon: MoveDiagonal },
  { id: "rectangle", label: "Box", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "angle", label: "Angle", icon: Ruler },
  { id: "freehand", label: "Draw", icon: PenLine },
];

const palette: readonly HexColor[] = ANNOTATION_SWATCHES;

interface AnalysisToolbarProps {
  activeTool: AnnotationTool;
  activeColor: HexColor;
  strokeWidth: number;
  overlayVisible: boolean;
  hasSelectedAnnotation: boolean;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: HexColor) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  onToggleOverlay: () => void;
}

export function AnalysisToolbar({
  activeTool,
  activeColor,
  strokeWidth,
  overlayVisible,
  hasSelectedAnnotation,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onClear,
  onDeleteSelected,
  onToggleOverlay,
}: AnalysisToolbarProps) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col items-center overflow-y-auto border-r border-border bg-surface-1 px-1.5 py-2">
      <div className="flex flex-col items-center gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onToolChange(tool.id)}
              title={`${tool.label} (${TOOL_HOTKEYS[tool.id]})`}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center border text-text-muted transition hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11",
                activeTool === tool.id
                  ? "border-accent bg-accent-dim text-text"
                  : "border-transparent bg-transparent",
              )}
              aria-label={tool.label}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>

      <div className="my-2 h-px w-8 bg-border" />

      <div className="flex flex-col items-center gap-1.5">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            className={cn(
              "size-[22px] shrink-0 border transition pointer-coarse:size-7",
              activeColor === color
                ? "scale-110 border-text"
                : "border-bg/50 opacity-80 hover:opacity-100",
            )}
            style={{ backgroundColor: color }}
            aria-label={`Use ${color}`}
            title={hasSelectedAnnotation ? "Colour (applies to selected shape)" : color}
          />
        ))}
      </div>

      <div className="my-2 h-px w-8 bg-border" />

      <div className="flex flex-col items-center gap-1" role="group" aria-label="Line width">
        {STROKE_WIDTHS.map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => onStrokeWidthChange(width)}
            aria-pressed={strokeWidth === width}
            aria-label={`Line width ${width}`}
            title={hasSelectedAnnotation ? `Width ${width} (applies to selected shape)` : `Line width ${width}`}
            className={cn(
              "flex h-6 w-9 items-center justify-center border",
              strokeWidth === width
                ? "border-accent bg-accent-dim"
                : "border-transparent hover:border-border-strong hover:bg-surface-2",
            )}
          >
            <span className="w-5 rounded-full bg-text-muted" style={{ height: width }} />
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 border-t border-border pt-2">
        <button
          type="button"
          onClick={onUndo}
          title="Undo (⌘Z)"
          className="flex size-9 shrink-0 items-center justify-center border border-transparent text-text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11"
          aria-label="Undo"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          title="Redo (⇧⌘Z)"
          className="flex size-9 shrink-0 items-center justify-center border border-transparent text-text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11"
          aria-label="Redo"
        >
          <RotateCw className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!hasSelectedAnnotation}
          title={hasSelectedAnnotation ? "Delete selected shape (Delete)" : "Select a shape to delete"}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center border border-transparent text-text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-text-muted",
            hasSelectedAnnotation ? "border-accent/50" : null,
          )}
          aria-label="Delete selected shape"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          title="Clear active pane"
          className="flex size-9 shrink-0 items-center justify-center border border-transparent text-text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11"
          aria-label="Clear active pane"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggleOverlay}
          title={overlayVisible ? "Hide drawings (O)" : "Show drawings (O)"}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center border hover:border-border-strong hover:bg-surface-2 hover:text-text pointer-coarse:size-11",
            overlayVisible
              ? "border-transparent text-text-muted"
              : "border-accent text-text",
          )}
          aria-label={overlayVisible ? "Hide overlay" : "Show overlay"}
        >
          {overlayVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
