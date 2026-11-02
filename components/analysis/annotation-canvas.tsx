"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Arrow, Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  AnnotationGeometry,
  AnnotationObject,
  AnnotationTool,
  HexColor,
  PaneId,
  Point,
} from "@/lib/types";
import {
  clientToStagePoint,
  createAnnotationBase,
  geometryToAbsolute,
  geometryToNormalized,
  isDegenerateShape,
  MIN_SHAPE_EXTENT_PX,
  normalizePoint,
} from "@/lib/analysis/annotations";
import { cn } from "@/lib/utils";

interface AnnotationCanvasProps {
  paneId: PaneId;
  tool: AnnotationTool;
  color: HexColor;
  annotations: AnnotationObject[];
  visible: boolean;
  selectedAnnotationId?: string | null;
  onSelectionChange: (annotationId: string | null) => void;
  onChange: (annotations: AnnotationObject[]) => void;
}

interface StageSize {
  width: number;
  height: number;
}

interface DraftShape {
  type: Exclude<AnnotationTool, "select" | "zoom-pan" | "angle">;
  start: Point;
  points: Point[];
}

function getRectFromPoints(start: Point, end: Point) {
  return {
    origin: {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
    },
    size: {
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    },
  };
}

/** Absolute (stage px) geometry for an in-progress drag; used for both preview and commit. */
function draftToGeometry(draft: DraftShape): AnnotationGeometry {
  const start = draft.points[0];
  const end = draft.points[draft.points.length - 1];

  switch (draft.type) {
    case "rectangle":
      return { kind: "rectangle", ...getRectFromPoints(start, end) };
    case "circle":
      return {
        kind: "circle",
        center: start,
        radius: Math.hypot(end.x - start.x, end.y - start.y),
      };
    case "freehand":
      return { kind: "freehand", points: draft.points };
    case "line":
    case "arrow":
      return { kind: draft.type, points: [start, end] };
  }
}

function angleBetween(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitude = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);

  if (!magnitude) {
    return 0;
  }

  const cosine = Math.min(1, Math.max(-1, dot / magnitude));
  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}

export function AnnotationCanvas({
  paneId,
  tool,
  color,
  annotations,
  visible,
  selectedAnnotationId,
  onSelectionChange,
  onChange,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [anglePoints, setAnglePoints] = useState<Point[]>([]);

  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      const next = {
        width: node.clientWidth,
        height: node.clientHeight,
      };
      setStageSize(next);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  // Latest draft for the window-level listeners (which are bound once per drag).
  const draftRef = useRef<DraftShape | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const isDrafting = draft !== null;

  const updateDraft = (next: DraftShape | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const toStagePoint = (event: PointerEvent): Point | null => {
    const node = stageRef.current?.container();

    if (!node) {
      return null;
    }

    return clientToStagePoint(
      { x: event.clientX, y: event.clientY },
      node.getBoundingClientRect(),
      stageSize,
    );
  };

  const commitShape = (shape: AnnotationObject) => {
    onChange([...annotations, shape]);
  };

  const finishDraft = (cancelled: boolean) => {
    const current = draftRef.current;
    activePointerRef.current = null;
    updateDraft(null);

    if (!current || cancelled) {
      return;
    }

    const geometry = draftToGeometry(current);

    if (isDegenerateShape(geometry)) {
      return;
    }

    commitShape(
      createAnnotationBase(
        current.type,
        paneId,
        geometryToNormalized(geometry, stageSize),
        color,
        annotations.length + 1,
      ),
    );
  };

  // Track the drag on window so strokes that leave the stage (or the pane) still finish.
  const handlersRef = useRef({ toStagePoint, finishDraft });
  useEffect(() => {
    handlersRef.current = { toStagePoint, finishDraft };
  });

  useEffect(() => {
    if (!isDrafting) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const current = draftRef.current;

      if (!current || event.pointerId !== activePointerRef.current) {
        return;
      }

      const pointer = handlersRef.current.toStagePoint(event);

      if (!pointer) {
        return;
      }

      if (current.type === "freehand") {
        const last = current.points[current.points.length - 1];

        if (Math.hypot(pointer.x - last.x, pointer.y - last.y) >= 1) {
          updateDraft({ ...current, points: [...current.points, pointer] });
        }

        return;
      }

      updateDraft({ ...current, points: [current.start, pointer] });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === activePointerRef.current) {
        handlersRef.current.finishDraft(event.type === "pointercancel");
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDrafting]);

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const native = event.evt;

    if (tool === "select" && event.target === event.target.getStage()) {
      onSelectionChange(null);
      return;
    }

    if (!visible || tool === "select" || tool === "zoom-pan") {
      return;
    }

    // One stroke at a time: ignore extra fingers and non-primary mouse buttons.
    if (!native.isPrimary || activePointerRef.current !== null) {
      return;
    }

    if (native.pointerType === "mouse" && native.button !== 0) {
      return;
    }

    const pointer = toStagePoint(native);

    if (!pointer) {
      return;
    }

    native.preventDefault();

    if (tool === "angle") {
      const previous = anglePoints[anglePoints.length - 1];

      // A double-tap on the same spot would make a zero-length arm.
      if (
        previous &&
        Math.hypot(
          pointer.x - previous.x * stageSize.width,
          pointer.y - previous.y * stageSize.height,
        ) < MIN_SHAPE_EXTENT_PX
      ) {
        return;
      }

      const nextPoints = [...anglePoints, normalizePoint(pointer, stageSize)];

      if (nextPoints.length === 3) {
        commitShape(
          createAnnotationBase(
            "angle",
            paneId,
            {
              kind: "angle",
              points: [nextPoints[0], nextPoints[1], nextPoints[2]],
            },
            color,
            annotations.length + 1,
          ),
        );
        setAnglePoints([]);
        return;
      }

      setAnglePoints(nextPoints);
      return;
    }

    activePointerRef.current = native.pointerId;
    updateDraft({
      type: tool,
      start: pointer,
      points: [pointer, pointer],
    });
  };

  const renderAnnotation = (annotation: AnnotationObject) => {
    const geometry = geometryToAbsolute(annotation.geometry, stageSize);
    const strokeWidth = annotation.style.strokeWidth;
    const isSelected = annotation.id === selectedAnnotationId;
    const selectableProps = {
      onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
        if (tool !== "select") {
          return;
        }

        event.cancelBubble = true;
        onSelectionChange(annotation.id);
      },
      onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
        if (tool !== "select") {
          return;
        }

        event.cancelBubble = true;
        onSelectionChange(annotation.id);
      },
      hitStrokeWidth: Math.max(16, strokeWidth + 10),
      shadowColor: isSelected ? "#f97316" : undefined,
      shadowBlur: isSelected ? 8 : 0,
      shadowOpacity: isSelected ? 0.85 : 0,
    };
    const selectedStrokeWidth = isSelected ? strokeWidth + 1 : strokeWidth;

    switch (geometry.kind) {
      case "line":
        return (
          <Line
            key={annotation.id}
            points={[
              geometry.points[0].x,
              geometry.points[0].y,
              geometry.points[1].x,
              geometry.points[1].y,
            ]}
            stroke={annotation.style.stroke}
            strokeWidth={selectedStrokeWidth}
            opacity={annotation.style.opacity}
            lineCap="round"
            {...selectableProps}
          />
        );
      case "arrow":
        return (
          <Arrow
            key={annotation.id}
            points={[
              geometry.points[0].x,
              geometry.points[0].y,
              geometry.points[1].x,
              geometry.points[1].y,
            ]}
            stroke={annotation.style.stroke}
            fill={annotation.style.stroke}
            strokeWidth={selectedStrokeWidth}
            opacity={annotation.style.opacity}
            pointerLength={10}
            pointerWidth={10}
            {...selectableProps}
          />
        );
      case "rectangle":
        return (
          <Rect
            key={annotation.id}
            x={geometry.origin.x}
            y={geometry.origin.y}
            width={geometry.size.width}
            height={geometry.size.height}
            stroke={annotation.style.stroke}
            strokeWidth={selectedStrokeWidth}
            opacity={annotation.style.opacity}
            {...selectableProps}
          />
        );
      case "circle":
        return (
          <Circle
            key={annotation.id}
            x={geometry.center.x}
            y={geometry.center.y}
            radius={geometry.radius}
            stroke={annotation.style.stroke}
            strokeWidth={selectedStrokeWidth}
            opacity={annotation.style.opacity}
            {...selectableProps}
          />
        );
      case "angle": {
        const value = angleBetween(geometry.points[0], geometry.points[1], geometry.points[2]);

        return (
          <Fragment key={annotation.id}>
            <Line
              points={[
                geometry.points[0].x,
                geometry.points[0].y,
                geometry.points[1].x,
                geometry.points[1].y,
              ]}
              stroke={annotation.style.stroke}
              strokeWidth={selectedStrokeWidth}
              opacity={annotation.style.opacity}
              {...selectableProps}
            />
            <Line
              points={[
                geometry.points[1].x,
                geometry.points[1].y,
                geometry.points[2].x,
                geometry.points[2].y,
              ]}
              stroke={annotation.style.stroke}
              strokeWidth={selectedStrokeWidth}
              opacity={annotation.style.opacity}
              {...selectableProps}
            />
            <Text
              x={geometry.points[1].x + 8}
              y={geometry.points[1].y + 8}
              text={`${value}°`}
              fill={annotation.style.stroke}
              fontSize={14}
              fontStyle="bold"
              onClick={selectableProps.onClick}
              onTap={selectableProps.onTap}
            />
          </Fragment>
        );
      }
      case "freehand":
        return (
          <Line
            key={annotation.id}
            points={geometry.points.flatMap((point) => [point.x, point.y])}
            stroke={annotation.style.stroke}
            strokeWidth={selectedStrokeWidth}
            opacity={annotation.style.opacity}
            lineCap="round"
            lineJoin="round"
            {...selectableProps}
          />
        );
    }
  };

  const previewGeometry = draft ? draftToGeometry(draft) : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 overflow-hidden",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        tool === "zoom-pan" ? "pointer-events-none" : null,
      )}
    >
      <Stage
        ref={stageRef}
        width={Math.max(stageSize.width, 1)}
        height={Math.max(stageSize.height, 1)}
        onPointerDown={handlePointerDown}
        className={tool === "select" || tool === "zoom-pan" ? "cursor-default" : "cursor-crosshair"}
      >
        <Layer>
          {annotations.map(renderAnnotation)}

          {previewGeometry?.kind === "line" || previewGeometry?.kind === "arrow" ? (
            <Line
              points={[
                previewGeometry.points[0].x,
                previewGeometry.points[0].y,
                previewGeometry.points[1].x,
                previewGeometry.points[1].y,
              ]}
              stroke={color}
              strokeWidth={3}
              dash={[8, 8]}
            />
          ) : null}

          {previewGeometry?.kind === "rectangle" ? (
            <Rect
              x={previewGeometry.origin.x}
              y={previewGeometry.origin.y}
              width={previewGeometry.size.width}
              height={previewGeometry.size.height}
              stroke={color}
              strokeWidth={3}
              dash={[8, 8]}
            />
          ) : null}

          {previewGeometry?.kind === "circle" ? (
            <Circle
              x={previewGeometry.center.x}
              y={previewGeometry.center.y}
              radius={previewGeometry.radius}
              stroke={color}
              strokeWidth={3}
              dash={[8, 8]}
            />
          ) : null}

          {previewGeometry?.kind === "freehand" ? (
            <Line
              points={previewGeometry.points.flatMap((point) => [point.x, point.y])}
              stroke={color}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
              dash={[8, 8]}
            />
          ) : null}

          {anglePoints.map((point, index) => {
            const absolute = {
              x: point.x * stageSize.width,
              y: point.y * stageSize.height,
            };

            return (
              <Circle
                key={`${point.x}-${point.y}-${index}`}
                x={absolute.x}
                y={absolute.y}
                radius={5}
                fill={color}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
