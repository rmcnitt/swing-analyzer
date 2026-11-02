"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
  clampGeometry,
  clientToStagePoint,
  createAnnotationBase,
  geometryToAbsolute,
  geometryToNormalized,
  isDegenerateShape,
  MIN_SHAPE_EXTENT_PX,
  normalizePoint,
} from "@/lib/analysis/annotations";
import {
  angleBetween,
  extendLineToFrame,
  labelAnchor,
  moveHandle,
  shapeHandles,
  translateGeometry,
} from "@/lib/analysis/shape-edit";
import { cn } from "@/lib/utils";

interface AnnotationCanvasProps {
  paneId: PaneId;
  tool: AnnotationTool;
  color: HexColor;
  /** Stroke width for new shapes. */
  strokeWidth: number;
  annotations: AnnotationObject[];
  visible: boolean;
  selectedAnnotationId?: string | null;
  onSelectionChange: (annotationId: string | null) => void;
  onChange: (annotations: AnnotationObject[]) => void;
  /** Filled with a function that renders the drawings (no edit chrome) at a given width. */
  overlayRendererRef?: RefObject<((width: number) => HTMLCanvasElement | null) | null>;
}

interface StageSize {
  width: number;
  height: number;
}

type DraftTool = Exclude<AnnotationTool, "select" | "zoom-pan" | "angle">;

/** A pointer drag in progress: drawing a new shape, or moving/reshaping a selected one. */
type Gesture =
  | { kind: "draft"; pointerId: number; type: DraftTool; points: Point[] }
  | {
      kind: "edit";
      pointerId: number;
      annotationId: string;
      /** "move" drags the whole shape; a number drags that handle. */
      target: "move" | number;
      start: Point;
      original: AnnotationGeometry;
      preview: AnnotationGeometry | null;
    };

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
function draftToGeometry(type: DraftTool, points: Point[]): AnnotationGeometry {
  const start = points[0];
  const end = points[points.length - 1];

  switch (type) {
    case "rectangle":
      return { kind: "rectangle", ...getRectFromPoints(start, end) };
    case "circle":
      return {
        kind: "circle",
        center: start,
        radius: Math.hypot(end.x - start.x, end.y - start.y),
      };
    case "freehand":
      return { kind: "freehand", points };
    case "line":
    case "arrow":
    case "plane":
      return { kind: type, points: [start, end] };
  }
}

const flat = (points: Point[]) => points.flatMap((point) => [point.x, point.y]);

export function AnnotationCanvas({
  paneId,
  tool,
  color,
  strokeWidth,
  annotations,
  visible,
  selectedAnnotationId,
  onSelectionChange,
  onChange,
  overlayRendererRef,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [anglePoints, setAnglePoints] = useState<Point[]>([]);

  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setStageSize({ width: node.clientWidth, height: node.clientHeight });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!overlayRendererRef) {
      return;
    }

    overlayRendererRef.current = (width) => {
      const stage = stageRef.current;

      if (!stage || !stage.width()) {
        return null;
      }

      // Exports show the drawings as-is, without handles or the selection glow.
      const chrome = stage.find(".edit-chrome");
      const glowing = stage.find<Konva.Shape>(".selected");
      chrome.forEach((node) => node.hide());
      glowing.forEach((node) => node.shadowEnabled(false));
      const canvas = stage.toCanvas({ pixelRatio: width / stage.width() });
      chrome.forEach((node) => node.show());
      glowing.forEach((node) => node.shadowEnabled(true));

      return canvas;
    };

    return () => {
      overlayRendererRef.current = null;
    };
  }, [overlayRendererRef]);

  // Latest gesture for the window-level listeners (which are bound once per drag).
  const gestureRef = useRef<Gesture | null>(null);
  const isGesturing = gesture !== null;

  const updateGesture = (next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
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

  const toStored = (geometry: AnnotationGeometry) =>
    clampGeometry(geometryToNormalized(geometry, stageSize));

  const finishGesture = (cancelled: boolean) => {
    const current = gestureRef.current;
    updateGesture(null);

    if (!current || cancelled) {
      return;
    }

    if (current.kind === "draft") {
      const geometry = draftToGeometry(current.type, current.points);

      if (!isDegenerateShape(geometry)) {
        onChange([
          ...annotations,
          createAnnotationBase(
            current.type,
            paneId,
            toStored(geometry),
            color,
            annotations.length + 1,
            strokeWidth,
          ),
        ]);
      }

      return;
    }

    // A click without movement only selects; reshaping into a sliver is ignored.
    if (!current.preview || isDegenerateShape(current.preview)) {
      return;
    }

    const geometry = toStored(current.preview);
    onChange(
      annotations.map((annotation) =>
        annotation.id === current.annotationId ? { ...annotation, geometry } : annotation,
      ),
    );
  };

  // Track drags on window so strokes that leave the stage (or the pane) still finish.
  const handlersRef = useRef({ toStagePoint, finishGesture, stageSize });
  useEffect(() => {
    handlersRef.current = { toStagePoint, finishGesture, stageSize };
  });

  useEffect(() => {
    if (!isGesturing) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const current = gestureRef.current;

      if (!current || event.pointerId !== current.pointerId) {
        return;
      }

      const pointer = handlersRef.current.toStagePoint(event);

      if (!pointer) {
        return;
      }

      if (current.kind === "edit") {
        const preview =
          current.target === "move"
            ? translateGeometry(
                current.original,
                { x: pointer.x - current.start.x, y: pointer.y - current.start.y },
                handlersRef.current.stageSize,
              )
            : moveHandle(current.original, current.target, pointer);

        updateGesture({ ...current, preview });
        return;
      }

      if (current.type === "freehand") {
        const last = current.points[current.points.length - 1];

        if (Math.hypot(pointer.x - last.x, pointer.y - last.y) >= 1) {
          updateGesture({ ...current, points: [...current.points, pointer] });
        }

        return;
      }

      updateGesture({ ...current, points: [current.points[0], pointer] });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === gestureRef.current?.pointerId) {
        handlersRef.current.finishGesture(event.type === "pointercancel");
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
  }, [isGesturing]);

  /** One gesture at a time: ignore extra fingers and non-primary mouse buttons. */
  const acceptsPointer = (native: PointerEvent) =>
    native.isPrimary &&
    gestureRef.current === null &&
    !(native.pointerType === "mouse" && native.button !== 0);

  const startEdit = (
    event: Konva.KonvaEventObject<PointerEvent>,
    annotation: AnnotationObject,
    target: "move" | number,
  ) => {
    if (tool !== "select" || !visible) {
      return;
    }

    event.cancelBubble = true;
    onSelectionChange(annotation.id);

    const native = event.evt;
    const pointer = toStagePoint(native);

    if (!acceptsPointer(native) || !pointer) {
      return;
    }

    native.preventDefault();
    updateGesture({
      kind: "edit",
      pointerId: native.pointerId,
      annotationId: annotation.id,
      target,
      start: pointer,
      original: geometryToAbsolute(annotation.geometry, stageSize),
      preview: null,
    });
  };

  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const native = event.evt;

    if (tool === "select" && event.target === event.target.getStage()) {
      onSelectionChange(null);
      return;
    }

    if (!visible || tool === "select" || tool === "zoom-pan" || !acceptsPointer(native)) {
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
        onChange([
          ...annotations,
          createAnnotationBase(
            "angle",
            paneId,
            { kind: "angle", points: [nextPoints[0], nextPoints[1], nextPoints[2]] },
            color,
            annotations.length + 1,
            strokeWidth,
          ),
        ]);
        setAnglePoints([]);
        return;
      }

      setAnglePoints(nextPoints);
      return;
    }

    updateGesture({ kind: "draft", pointerId: native.pointerId, type: tool, points: [pointer, pointer] });
  };

  const setCursor = (cursor: string) => {
    const node = stageRef.current?.container();

    if (node) {
      node.style.cursor = cursor;
    }
  };

  const renderAnnotation = (annotation: AnnotationObject) => {
    const editing = gesture?.kind === "edit" && gesture.annotationId === annotation.id ? gesture : null;
    const geometry = editing?.preview ?? geometryToAbsolute(annotation.geometry, stageSize);
    const { stroke, opacity } = annotation.style;
    const isSelected = annotation.id === selectedAnnotationId;
    const width = isSelected ? annotation.style.strokeWidth + 1 : annotation.style.strokeWidth;
    const canEdit = tool === "select";
    const shapeProps = {
      name: isSelected ? "selected" : undefined,
      stroke,
      strokeWidth: width,
      opacity,
      onPointerDown: (event: Konva.KonvaEventObject<PointerEvent>) => startEdit(event, annotation, "move"),
      onMouseEnter: () => canEdit && setCursor("move"),
      onMouseLeave: () => setCursor(""),
      hitStrokeWidth: Math.max(16, annotation.style.strokeWidth + 10),
      shadowColor: isSelected ? "#f97316" : undefined,
      shadowBlur: isSelected ? 8 : 0,
      shadowOpacity: isSelected ? 0.85 : 0,
    };
    const label = annotation.label ? (
      <Text
        {...labelAnchor(geometry)}
        text={annotation.label}
        fill={stroke}
        fontSize={14}
        fontStyle="bold"
        shadowColor="#000"
        shadowBlur={4}
        shadowOpacity={0.9}
        listening={false}
      />
    ) : null;
    let shape: ReactNode;

    switch (geometry.kind) {
      case "line":
        shape = <Line points={flat(geometry.points)} lineCap="round" {...shapeProps} />;
        break;
      case "plane": {
        const [a, b] = geometry.points;
        shape = (
          <>
            <Line points={flat(extendLineToFrame(a, b, stageSize))} lineCap="round" {...shapeProps} />
            {[a, b].map((point, index) => (
              <Circle key={index} x={point.x} y={point.y} radius={3} fill={stroke} opacity={opacity} listening={false} />
            ))}
          </>
        );
        break;
      }
      case "arrow":
        shape = (
          <Arrow points={flat(geometry.points)} fill={stroke} pointerLength={10} pointerWidth={10} {...shapeProps} />
        );
        break;
      case "rectangle":
        shape = (
          <Rect
            x={geometry.origin.x}
            y={geometry.origin.y}
            width={geometry.size.width}
            height={geometry.size.height}
            {...shapeProps}
          />
        );
        break;
      case "circle":
        shape = <Circle x={geometry.center.x} y={geometry.center.y} radius={geometry.radius} {...shapeProps} />;
        break;
      case "angle": {
        const [a, b, c] = geometry.points;
        shape = (
          <>
            <Line points={flat([a, b, c])} lineJoin="round" {...shapeProps} />
            <Text
              x={b.x + 8}
              y={b.y + 8}
              text={`${angleBetween(a, b, c)}°`}
              fill={stroke}
              fontSize={14}
              fontStyle="bold"
              shadowColor="#000"
              shadowBlur={4}
              shadowOpacity={0.9}
              listening={false}
            />
          </>
        );
        break;
      }
      case "freehand":
        shape = <Line points={flat(geometry.points)} lineCap="round" lineJoin="round" {...shapeProps} />;
        break;
    }

    return (
      <Fragment key={annotation.id}>
        {shape}
        {label}
      </Fragment>
    );
  };

  const selected =
    tool === "select" && visible
      ? annotations.find((annotation) => annotation.id === selectedAnnotationId)
      : undefined;
  const selectedGeometry = selected
    ? gesture?.kind === "edit" && gesture.annotationId === selected.id && gesture.preview
      ? gesture.preview
      : geometryToAbsolute(selected.geometry, stageSize)
    : null;
  const preview = gesture?.kind === "draft" ? draftToGeometry(gesture.type, gesture.points) : null;
  const previewProps = { stroke: color, strokeWidth, dash: [8, 8], listening: false };

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

          {selected && selectedGeometry
            ? shapeHandles(selectedGeometry).map((point, index) => (
                <Circle
                  key={`handle-${index}`}
                  name="edit-chrome"
                  x={point.x}
                  y={point.y}
                  radius={6}
                  fill="#ffffff"
                  stroke="#f97316"
                  strokeWidth={2}
                  hitStrokeWidth={18}
                  onPointerDown={(event) => startEdit(event, selected, index)}
                  onMouseEnter={() => setCursor("crosshair")}
                  onMouseLeave={() => setCursor("")}
                />
              ))
            : null}

          {preview?.kind === "line" || preview?.kind === "arrow" ? (
            <Line points={flat(preview.points)} {...previewProps} />
          ) : null}

          {preview?.kind === "plane" ? (
            <Line points={flat(extendLineToFrame(preview.points[0], preview.points[1], stageSize))} {...previewProps} />
          ) : null}

          {preview?.kind === "rectangle" ? (
            <Rect
              x={preview.origin.x}
              y={preview.origin.y}
              width={preview.size.width}
              height={preview.size.height}
              {...previewProps}
            />
          ) : null}

          {preview?.kind === "circle" ? (
            <Circle x={preview.center.x} y={preview.center.y} radius={preview.radius} {...previewProps} />
          ) : null}

          {preview?.kind === "freehand" ? (
            <Line points={flat(preview.points)} lineCap="round" lineJoin="round" {...previewProps} />
          ) : null}

          {anglePoints.map((point, index) => (
            <Circle
              key={`${point.x}-${point.y}-${index}`}
              x={point.x * stageSize.width}
              y={point.y * stageSize.height}
              radius={5}
              fill={color}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
