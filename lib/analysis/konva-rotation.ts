import type Konva from "konva";
import { isScreenRotated, layoutPoint, layoutRect } from "@/lib/analysis/screen-rotation";

interface StageInternals {
  content?: HTMLElement;
  setPointersPositions: (event: unknown) => void;
  _getContentPosition: () => { top: number; left: number; scaleX: number; scaleY: number };
}

interface PointerLike {
  clientX: number;
  clientY: number;
  pointerId?: number;
  touches?: ArrayLike<Touch>;
  changedTouches?: ArrayLike<Touch>;
}

const mapTouches = (touches: ArrayLike<Touch> | undefined) =>
  touches
    ? Array.from(touches, (touch) => {
        const point = layoutPoint(touch.clientX, touch.clientY);
        return { identifier: touch.identifier, clientX: point.x, clientY: point.y };
      })
    : undefined;

/**
 * Konva turns pointer events into stage positions from screen coordinates and the canvas's
 * bounding box, which comes out sideways when the workspace is turned for phone compare. This
 * wraps the stage's two internal steps (Konva 10) to work in the unrotated layout, so selecting,
 * moving and drawing shapes still land where the finger is. No change while not rotated.
 */
export function makeStageRotationAware(stage: Konva.Stage) {
  const internals = stage as unknown as StageInternals;
  const setPositions = internals.setPointersPositions.bind(stage);
  const contentPosition = internals._getContentPosition.bind(stage);

  internals._getContentPosition = () => {
    const content = internals.content;

    if (!isScreenRotated() || !content) {
      return contentPosition();
    }

    const rect = layoutRect(content);
    return {
      top: rect.top,
      left: rect.left,
      scaleX: rect.width / content.clientWidth || 1,
      scaleY: rect.height / content.clientHeight || 1,
    };
  };

  internals.setPointersPositions = (event: unknown) => {
    if (!isScreenRotated() || !event) {
      setPositions(event);
      return;
    }

    const source = event as PointerLike;
    const point = layoutPoint(source.clientX, source.clientY);
    setPositions({
      clientX: point.x,
      clientY: point.y,
      pointerId: source.pointerId,
      touches: mapTouches(source.touches),
      changedTouches: mapTouches(source.changedTouches),
    });
  };
}
