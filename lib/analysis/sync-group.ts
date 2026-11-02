import { followerCorrection } from "@/lib/analysis/sync";
import type { PaneId } from "@/lib/types";

/** What the group needs from a pane's video element. */
export interface SyncMedia {
  readonly currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): void;
  pause(): void;
  seek(time: number): void;
  /** Multiplier on the pane's chosen speed, used to nudge a follower back into step. */
  setRateMultiplier(multiplier: number): void;
}

/** Maps a time in the leader pane to the matching time in a follower pane. */
export type TimeMapper = (from: PaneId, to: PaneId, time: number) => number;

const identity: TimeMapper = (_from, _to, time) => time;

/**
 * Leader-driven playback for the compare panes. Whichever pane the user acts on leads; when
 * sync is enabled the others follow it. While playing, the leader's presented frames drive
 * small rate corrections on followers; pause and seek align followers exactly.
 */
export class SyncGroup {
  private members = new Map<PaneId, SyncMedia>();
  private enabled = false;
  private leaderId: PaneId | null = null;

  constructor(private readonly mapTime: TimeMapper = identity) {}

  register(paneId: PaneId, media: SyncMedia) {
    this.members.set(paneId, media);

    return () => {
      if (this.members.get(paneId) === media) {
        this.members.delete(paneId);
      }

      if (this.leaderId === paneId) {
        this.leaderId = null;
      }
    };
  }

  get(paneId: PaneId) {
    return this.members.get(paneId);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;

    if (!enabled) {
      this.members.forEach((media) => media.setRateMultiplier(1));
    }
  }

  private followers(leaderId: PaneId) {
    if (!this.enabled) {
      return [];
    }

    return [...this.members].filter(([id]) => id !== leaderId);
  }

  play(leaderId: PaneId) {
    const leader = this.members.get(leaderId);

    if (!leader) {
      return;
    }

    this.leaderId = leaderId;

    for (const [id, follower] of this.followers(leaderId)) {
      follower.setRateMultiplier(1);
      follower.seek(this.mapTime(leaderId, id, leader.currentTime));
      follower.play();
    }

    leader.setRateMultiplier(1);
    leader.play();
  }

  pause(leaderId: PaneId) {
    const leader = this.members.get(leaderId);

    if (!leader) {
      return;
    }

    leader.pause();
    leader.setRateMultiplier(1);

    for (const [id, follower] of this.followers(leaderId)) {
      follower.pause();
      follower.setRateMultiplier(1);
      follower.seek(this.mapTime(leaderId, id, leader.currentTime));
    }

    this.leaderId = null;
  }

  seek(leaderId: PaneId, time: number) {
    const leader = this.members.get(leaderId);

    if (!leader) {
      return;
    }

    leader.seek(time);

    for (const [id, follower] of this.followers(leaderId)) {
      follower.seek(this.mapTime(leaderId, id, time));
    }
  }

  /** Call for every presented frame of a playing pane; only the leader's frames correct. */
  onFrame(paneId: PaneId, time: number) {
    if (!this.enabled || paneId !== this.leaderId) {
      return;
    }

    for (const [id, follower] of this.followers(paneId)) {
      // A shorter clip that has finished just waits at its end.
      if (follower.paused || follower.ended) {
        continue;
      }

      const correction = followerCorrection(this.mapTime(paneId, id, time), follower.currentTime);

      if (correction.kind === "seek") {
        follower.seek(correction.time);
        follower.setRateMultiplier(1);
      } else {
        follower.setRateMultiplier(correction.multiplier);
      }
    }
  }

  /** The leader reached its end on its own; stop everything in place. */
  onEnded(paneId: PaneId) {
    if (paneId === this.leaderId) {
      this.pause(paneId);
    }
  }
}
