"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Arrow, Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { AnnotationObject, AnnotationTool, HexColor, PaneId, Point } from "@/lib/types";
import {
  createAnnotationBase,
  geometryToAbsolute,
  geometryToNormalized,
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

  const getPointerPosition = () => {
    const stage = stageRef.current;

    if (!stage) {
      return null;
    }

    const pointer = stage.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return pointer as Point;
  };

  const commitShape = (shape: AnnotationObject) => {
    onChange([...annotations, shape]);
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === "select" && event.target === event.target.getStage()) {
      onSelectionChange(null);
      return;
    }

    if (!visible || tool === "select" || tool === "zoom-pan") {
      return;
    }

    const pointer = getPointerPosition();

    if (!pointer) {
      return;
    }

    if (tool === "angle") {
      const normalized = normalizePoint(pointer, stageSize);
      const nextPoints = [...anglePoints, normalized];

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

    setDraft({
      type: tool,
      start: pointer,
      points: [pointer, pointer],
    });
  };

  const handlePointerMove = () => {
    if (!draft) {
      return;
    }

    const pointer = getPointerPosition();

    if (!pointer) {
      return;
    }

    if (draft.type === "freehand") {
      setDraft({
        ...draft,
        points: [...draft.points, pointer],
      });
      return;
    }

    setDraft({
      ...draft,
      points: [draft.start, pointer],
    });
  };

  const handlePointerUp = () => {
    if (!draft) {
      return;
    }

    const [start, end] = draft.points;
    let annotation: AnnotationObject | null = null;

    if (draft.type === "line" || draft.type === "arrow") {
      annotation = createAnnotationBase(
        draft.type,
        paneId,
        geometryToNormalized(
          {
            kind: draft.type,
            points: [start, end],
          },
          stageSize,
        ),
        color,
        annotations.length + 1,
      );
    }

    if (draft.type === "rectangle") {
      const rect = getRectFromPoints(start, end);
      annotation = createAnnotationBase(
        "rectangle",
        paneId,
        geometryToNormalized(
          {
            kind: "rectangle",
            origin: rect.origin,
            size: rect.size,
          },
          stageSize,
        ),
        color,
        annotations.length + 1,
      );
    }

    if (draft.type === "circle") {
      annotation = createAnnotationBase(
        "circle",
        paneId,
        geometryToNormalized(
          {
            kind: "circle",
            center: start,
            radius: Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2),
          },
          stageSize,
        ),
        color,
        annotations.length + 1,
      );
    }

    if (draft.type === "freehand" && draft.points.length > 1) {
      annotation = createAnnotationBase(
        "freehand",
        paneId,
        geometryToNormalized(
          {
            kind: "freehand",
            points: draft.points,
          },
          stageSize,
        ),
        color,
        annotations.length + 1,
      );
    }

    if (annotation) {
      commitShape(annotation);
    }

    setDraft(null);
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

  const previewGeometry = draft
    ? geometryToAbsolute(
        geometryToNormalized(
          draft.type === "rectangle"
            ? {
                kind: "rectangle",
                ...getRectFromPoints(draft.points[0], draft.points[draft.points.length - 1]),
              }
            : draft.type === "circle"
              ? {
                  kind: "circle",
                  center: draft.points[0],
                  radius: Math.sqrt(
                    (draft.points[draft.points.length - 1].x - draft.points[0].x) ** 2 +
                      (draft.points[draft.points.length - 1].y - draft.points[0].y) ** 2,
                  ),
                }
              : draft.type === "freehand"
                ? {
                    kind: "freehand",
                    points: draft.points,
                  }
                : {
                    kind: draft.type,
                    points: [draft.points[0], draft.points[draft.points.length - 1]],
                  },
          stageSize,
        ),
        stageSize,
      )
    : null;

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
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
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
