import { describe, expect, it } from "vitest";
import { followerCorrection } from "@/lib/analysis/sync";
import { SyncGroup, type SyncMedia } from "@/lib/analysis/sync-group";
import { createTimeStore } from "@/lib/video/time-store";

class FakeMedia implements SyncMedia {
  currentTime = 0;
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
  const group = new SyncGroup((from, to, time) => (to === "secondary" ? time + offset : time - offset));
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
