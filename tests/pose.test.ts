import { describe, expect, it, vi } from "vitest";
import {
  FRAME_STRIDE,
  frameIndexNear,
  hasPose,
  LANDMARK_COUNT,
  landmarkAt,
  LM,
  POSE_TRACK_VERSION,
  sampleTimes,
  worldLandmarkAt,
  writeFrame,
  type PoseTrack,
} from "@/lib/pose/landmarks";
import { createPoseStore, type PoseStoreDeps } from "@/lib/pose/pose-store";

function makeTrack(times: number[], missing: number[] = []): PoseTrack {
  const data = new Float32Array(times.length * FRAME_STRIDE);

  times.forEach((time, index) => {
    if (missing.includes(index)) {
      writeFrame(data, index, undefined, undefined);
      return;
    }

    const points = Array.from({ length: LANDMARK_COUNT }, (_, i) => ({
      x: i / 100,
      y: time,
      visibility: 0.9,
    }));
    const world = points.map((point, i) => ({ x: i, y: -i, z: time }));
    writeFrame(data, index, points, world);
  });

  return {
    version: POSE_TRACK_VERSION,
    videoId: "clip",
    model: "test",
    times,
    data,
    duration: times.at(-1) ?? 0,
    analyzedAt: "2026-11-03T00:00:00.000Z",
  };
}

describe("pose track packing", () => {
  it("round-trips image and world landmarks", () => {
    const track = makeTrack([0.1, 0.2]);

    expect(landmarkAt(track, 1, LM.leftWrist)).toEqual({
      x: expect.closeTo(0.15, 5),
      y: expect.closeTo(0.2, 5),
      visibility: expect.closeTo(0.9, 5),
    });
    expect(worldLandmarkAt(track, 0, LM.rightHip)).toEqual({ x: 24, y: -24, z: expect.closeTo(0.1, 5) });
  });

  it("marks frames with no golfer", () => {
    const track = makeTrack([0, 0.1, 0.2], [1]);

    expect(hasPose(track, 0)).toBe(true);
    expect(hasPose(track, 1)).toBe(false);
    expect(hasPose(track, 3)).toBe(false);
  });
});

describe("frameIndexNear", () => {
  const track = makeTrack([0.05, 0.15, 0.25, 0.35]);

  it("finds the closest analyzed frame", () => {
    expect(frameIndexNear(track, 0)).toBe(0);
    expect(frameIndexNear(track, 0.16)).toBe(1);
    expect(frameIndexNear(track, 0.21)).toBe(2);
    expect(frameIndexNear(track, 0.36)).toBe(3);
  });

  it("takes the later frame at a frame boundary, despite float error", () => {
    expect(frameIndexNear(track, 0.2)).toBe(2);
    expect(frameIndexNear(track, 0.199999)).toBe(2);
    expect(frameIndexNear(track, 0.2000001)).toBe(2);
  });

  it("returns -1 beyond the tolerance", () => {
    expect(frameIndexNear(track, 0.6)).toBe(-1);
    expect(frameIndexNear(track, 0.16, 0.001)).toBe(-1);
    expect(frameIndexNear(makeTrack([]), 0)).toBe(-1);
  });
});

describe("sampleTimes", () => {
  it("samples the middle of every frame", () => {
    const times = sampleTimes(0.1, 30);

    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(1 / 60);
    expect(times[2]).toBeCloseTo(2.5 / 30);
  });

  it("thins long clips to the frame budget", () => {
    expect(sampleTimes(60, 240, 1200).length).toBeLessThanOrEqual(1200);
  });
});

describe("createPoseStore", () => {
  const clip = { id: "clip", url: "blob:clip", fps: 30 };

  function setup(overrides: Partial<PoseStoreDeps> = {}) {
    const deps: PoseStoreDeps = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
      analyze: vi.fn(async ({ onProgress }) => {
        onProgress(0.5);
        onProgress(1);
        return makeTrack([0.1]);
      }),
      ...overrides,
    };

    return { deps, store: createPoseStore(deps) };
  }

  it("uses a cached track", async () => {
    const track = makeTrack([0.1]);
    const { store } = setup({ load: vi.fn(async () => track) });

    await store.ensureLoaded("clip");

    expect(store.get("clip")).toMatchObject({ status: "ready", track });
  });

  it("reports none when nothing is cached, then analyzes and saves", async () => {
    const { deps, store } = setup();
    const progress: number[] = [];
    store.subscribe(() => progress.push(store.get("clip").progress));

    await store.ensureLoaded("clip");
    expect(store.get("clip").status).toBe("none");

    await store.analyze(clip);

    expect(store.get("clip").status).toBe("ready");
    expect(deps.save).toHaveBeenCalledWith(store.get("clip").track);
    expect(progress).toContain(0.5);
  });

  it("returns to none when cancelled and to error on failure", async () => {
    const cancelled = setup({
      analyze: vi.fn(
        ({ signal }) =>
          new Promise<PoseTrack>((_, reject) =>
            signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
          ),
      ),
    });
    const running = cancelled.store.analyze(clip);
    cancelled.store.cancel("clip");
    await running;
    expect(cancelled.store.get("clip").status).toBe("none");

    const failed = setup({ analyze: vi.fn(async () => Promise.reject(new Error("decode"))) });
    await failed.store.analyze(clip);
    expect(failed.store.get("clip")).toMatchObject({ status: "error", error: "decode" });
  });

  it("doesn't let a slow cache read overwrite a finished analysis", async () => {
    let resolveLoad: (track: PoseTrack | null) => void = () => undefined;
    const { store } = setup({ load: () => new Promise((resolve) => (resolveLoad = resolve)) });

    const loading = store.ensureLoaded("clip");
    await store.analyze(clip);
    resolveLoad(null);
    await loading;

    expect(store.get("clip").status).toBe("ready");
  });
});

describe("createPoseStore prepare", () => {
  it("shows the prepared track but saves the raw one", async () => {
    const raw = makeTrack([0.1]);
    const prepared = makeTrack([0.2]);
    const save = vi.fn(async () => undefined);
    const store = createPoseStore({
      load: async () => null,
      save,
      analyze: async () => raw,
      prepare: () => prepared,
    });

    await store.analyze({ id: "clip", url: "blob:clip", fps: 30 });

    expect(store.get("clip").track).toBe(prepared);
    expect(save).toHaveBeenCalledWith(raw);
  });
});
