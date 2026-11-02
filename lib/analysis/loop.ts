import type { LoopRange } from "@/lib/types";
import { clamp } from "@/lib/utils";

/** Shortest loop allowed, so in and out can't collapse onto one frame. */
export const MIN_LOOP_SECONDS = 0.05;

/** Moves the in or out point to `time`, keeping the range ordered and inside the clip. */
export function setLoopPoint(
  loop: LoopRange | undefined,
  point: "start" | "end",
  time: number,
  duration: number,
): LoopRange {
  const current = loop ?? { start: 0, end: duration };
  const t = clamp(time, 0, duration);

  if (point === "start") {
    // Setting in past the out point restarts the range there, running to the clip end.
    const end = current.end - t >= MIN_LOOP_SECONDS ? current.end : duration;
    return { start: Math.min(t, end - MIN_LOOP_SECONDS), end };
  }

  const start = t - current.start >= MIN_LOOP_SECONDS ? current.start : 0;
  return { start, end: Math.max(t, start + MIN_LOOP_SECONDS) };
}

/** A sensible first loop: Address→Finish when both are marked, otherwise the whole clip. */
export function defaultLoop(positions: ReadonlyMap<string, number>, duration: number): LoopRange {
  const address = positions.get("address");
  const finish = positions.get("finish");

  if (address !== undefined && finish !== undefined && finish - address >= MIN_LOOP_SECONDS) {
    return { start: address, end: finish };
  }

  return { start: 0, end: duration };
}

/** Where to (re)start playback so it stays inside the loop. */
export function loopStartFor(loop: LoopRange, time: number) {
  return time < loop.start || time >= loop.end - 1e-3 ? loop.start : time;
}
