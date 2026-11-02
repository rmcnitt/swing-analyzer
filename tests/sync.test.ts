import { describe, expect, it } from "vitest";
import {
  createCheckpointMapper,
  followerCorrection,
  mapThroughAnchors,
  matchCheckpoints,
} from "@/lib/analysis/sync";
import { SyncGroup, type SyncMedia } from "@/lib/analysis/sync-group";
import { createTimeStore } from "@/lib/video/time-store";

class FakeMedia implements SyncMedia {
  currentTime = 0;
  duration = 10;
  paused = true;
  ended = false;
  multiplier = 1;
  seeks: number[] = [];
  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  seek(time: number) {
    this.currentTime = time;
    this.seeks.push(time);
  }
  setRateMultiplier(multiplier: number) {
    this.multiplier = multiplier;
  }
}

function setup(enabled = true, offset = 0) {
  const group = new SyncGroup((from, to, time) => ({
    time: to === "secondary" ? time + offset : time - offset,
    rate: 1,
  }));
  const primary = new FakeMedia();
  const secondary = new FakeMedia();
  group.register("primary", primary);
  group.register("secondary", secondary);
  group.setEnabled(enabled);
  return { group, primary, secondary };
}

describe("followerCorrection", () => {
  it("ignores drift within the deadband", () => {
    expect(followerCorrection(1.0, 1.004)).toEqual({ kind: "rate", multiplier: 1 });
  });

  it("speeds up a follower that's behind and slows one that's ahead", () => {
    const behind = followerCorrection(1.05, 1.0);
    const ahead = followerCorrection(1.0, 1.05);

    expect(behind.kind === "rate" && behind.multiplier).toBeGreaterThan(1);
    expect(ahead.kind === "rate" && ahead.multiplier).toBeLessThan(1);
  });

  it("caps the rate adjustment", () => {
    expect(followerCorrection(1.2, 1.0)).toEqual({ kind: "rate", multiplier: 1.15 });
  });

  it("seeks when drift is large", () => {
    expect(followerCorrection(2.0, 1.0)).toEqual({ kind: "seek", time: 2.0 });
  });
});

describe("mapThroughAnchors", () => {
  it("is the identity with no checkpoints", () => {
    expect(mapThroughAnchors([], 1.3)).toEqual({ time: 1.3, rate: 1 });
  });

  it("falls back to a constant offset with one checkpoint", () => {
    expect(mapThroughAnchors([[2, 1.5]], 3)).toEqual({ time: 2.5, rate: 1 });
    expect(mapThroughAnchors([[2, 1.5]], 0.5)).toEqual({ time: 0, rate: 1 });
  });

  it("stretches time between checkpoints so differing tempos stay aligned", () => {
    // Leader backswing (Address→Top) takes 1.0s; follower's takes 0.8s.
    const anchors = [
      [1, 2],
      [2, 2.8],
      [2.3, 3.05],
    ] as const;

    expect(mapThroughAnchors(anchors, 1)).toEqual({ time: 2, rate: 1 });
    expect(mapThroughAnchors(anchors, 2).time).toBeCloseTo(2.8);
    expect(mapThroughAnchors(anchors, 1.5).time).toBeCloseTo(2.4);
    expect(mapThroughAnchors(anchors, 1.5).rate).toBeCloseTo(0.8);
    expect(mapThroughAnchors(anchors, 2.15).time).toBeCloseTo(2.925);
    expect(mapThroughAnchors(anchors, 2.15).rate).toBeCloseTo(0.25 / 0.3);
  });

  it("uses the nearest checkpoint's offset outside the marked range", () => {
    const anchors = [
      [1, 2],
      [2, 2.8],
    ] as const;

    expect(mapThroughAnchors(anchors, 0.5)).toEqual({ time: 1.5, rate: 1 });
    expect(mapThroughAnchors(anchors, 3).time).toBeCloseTo(3.8);
    expect(mapThroughAnchors(anchors, 3).rate).toBe(1);
  });

  it("caps extreme tempo ratios", () => {
    expect(mapThroughAnchors([[0, 0], [1, 10]], 0.5).rate).toBe(4);
  });
});

describe("matchCheckpoints", () => {
  const times = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it("pairs only positions marked in both panes, in time order", () => {
    expect(
      matchCheckpoints(times({ top: 2, address: 1, finish: 4 }), times({ address: 0.5, top: 1.4 })),
    ).toEqual([
      { key: "address", primary: 1, secondary: 0.5 },
      { key: "top", primary: 2, secondary: 1.4 },
    ]);
  });

  it("drops a checkpoint that would run time backwards", () => {
    const matched = matchCheckpoints(
      times({ address: 1, top: 2, impact: 2.3, finish: 3 }),
      // Top mis-marked after finish in the follower.
      times({ address: 0.5, top: 2.6, impact: 1.6, finish: 2.5 }),
    );

    expect(matched.map((checkpoint) => checkpoint.key)).toEqual(["address", "impact", "finish"]);
  });
});

describe("createCheckpointMapper", () => {
  it("maps both directions through the same checkpoints", () => {
    const mapper = createCheckpointMapper([
      { key: "address", primary: 1, secondary: 2 },
      { key: "top", primary: 2, secondary: 2.8 },
    ]);

    expect(mapper("primary", "secondary", 1.5).time).toBeCloseTo(2.4);
    expect(mapper("secondary", "primary", 2.4).time).toBeCloseTo(1.5);
    expect(mapper("secondary", "primary", 2.4).rate).toBeCloseTo(1.25);
    expect(mapper("primary", "primary", 1.5)).toEqual({ time: 1.5, rate: 1 });
  });
});

describe("SyncGroup", () => {
  it("only drives the acting pane when sync is off", () => {
    const { group, primary, secondary } = setup(false);

    group.play("primary");
    group.seek("primary", 1.5);

    expect(primary.paused).toBe(false);
    expect(secondary.paused).toBe(true);
    expect(secondary.seeks).toEqual([]);
  });

  it("starts followers at the leader's mapped time", () => {
    const { group, primary, secondary } = setup(true, 0.5);
    primary.currentTime = 1;

    group.play("primary");

    expect(secondary.paused).toBe(false);
    expect(secondary.currentTime).toBe(1.5);
  });

  it("aligns followers exactly on pause and seek", () => {
    const { group, primary, secondary } = setup();

    group.play("secondary");
    secondary.currentTime = 2.2;
    primary.currentTime = 2.1;
    group.pause("secondary");

    expect(primary.paused).toBe(true);
    expect(primary.currentTime).toBe(2.2);

    group.seek("primary", 0.75);
    expect(secondary.currentTime).toBe(0.75);
  });

  it("nudges followers from the leader's frames, not its own", () => {
    const { group, secondary } = setup();

    group.play("primary");
    secondary.currentTime = 0.95;
    group.onFrame("secondary", 0.95);
    expect(secondary.multiplier).toBe(1);

    group.onFrame("primary", 1.0);
    expect(secondary.multiplier).toBeGreaterThan(1);
    expect(secondary.seeks).toEqual([0]);
  });

  it("stops everything when the leader ends", () => {
    const { group, secondary } = setup();

    group.play("primary");
    group.onEnded("primary");

    expect(secondary.paused).toBe(true);
  });

  it("clamps followers to their clip edges", () => {
    const { group, secondary } = setup(true, -1);

    group.seek("primary", 0.4);
    expect(secondary.currentTime).toBe(0);

    group.seek("primary", 20);
    expect(secondary.currentTime).toBe(10);
  });

  it("holds a follower at its start until the leader reaches its first frame", () => {
    const { group, primary, secondary } = setup(true, -1);
    primary.currentTime = 0.5;

    group.play("primary");
    expect(secondary.paused).toBe(true);
    expect(secondary.currentTime).toBe(0);

    group.onFrame("primary", 0.8);
    expect(secondary.paused).toBe(true);

    group.onFrame("primary", 1.2);
    expect(secondary.paused).toBe(false);
    expect(secondary.currentTime).toBeCloseTo(0.2);
  });

  it("stops a follower at its end while the leader plays on", () => {
    const { group, secondary } = setup(true, 1);

    group.play("primary");
    secondary.currentTime = 9.5;
    group.onFrame("primary", 9.6);

    expect(secondary.paused).toBe(true);
    expect(secondary.currentTime).toBe(10);
  });

  it("runs the follower at the local tempo ratio", () => {
    const group = new SyncGroup(
      createCheckpointMapper([
        { key: "address", primary: 1, secondary: 1 },
        { key: "top", primary: 2, secondary: 1.8 },
      ]),
    );
    const primary = new FakeMedia();
    const secondary = new FakeMedia();
    group.register("primary", primary);
    group.register("secondary", secondary);
    group.setEnabled(true);

    primary.currentTime = 1.5;
    group.play("primary");
    expect(secondary.currentTime).toBeCloseTo(1.4);
    expect(secondary.multiplier).toBeCloseTo(0.8);

    group.onFrame("primary", 1.5);
    expect(secondary.multiplier).toBeCloseTo(0.8);
  });

  it("resets nudged rates when sync is turned off", () => {
    const { group, secondary } = setup();

    group.play("primary");
    secondary.currentTime = 0.9;
    group.onFrame("primary", 1.0);
    group.setEnabled(false);

    expect(secondary.multiplier).toBe(1);
  });
});

describe("createTimeStore", () => {
  it("notifies subscribers only on change", () => {
    const store = createTimeStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.set(1);
    store.set(1);
    unsubscribe();
    store.set(2);

    expect(calls).toBe(1);
    expect(store.get()).toBe(2);
  });
});
