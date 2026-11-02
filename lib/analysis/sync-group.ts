import { followerCorrection, identityMapper, type TimeMapper } from "@/lib/analysis/sync";
import type { PaneId } from "@/lib/types";

/** What the group needs from a pane's video element. */
export interface SyncMedia {
  readonly currentTime: number;
  /** Clip length in seconds; Infinity while unknown. */
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): void;
  pause(): void;
  seek(time: number): void;
  /** Multiplier on the pane's chosen speed, used to match tempo and nudge a follower into step. */
  setRateMultiplier(multiplier: number): void;
}

interface FollowerTarget {
  /** Mapped time clamped to the follower clip. */
  time: number;
  rate: number;
  /** The mapped time lies before the clip's start or past its end, so the follower waits. */
  outside: boolean;
}

/**
 * Leader-driven playback for the compare panes. Whichever pane the user acts on leads; when
 * sync is enabled the others follow it through the time mapper (matched swing positions).
 * While playing, the leader's presented frames set each follower's speed to the local tempo
 * ratio plus a small drift correction; pause and seek align followers exactly.
 */
export class SyncGroup {
  private members = new Map<PaneId, SyncMedia>();
  private enabled = false;
  private leaderId: PaneId | null = null;

  constructor(private mapTime: TimeMapper = identityMapper) {}

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

  setTimeMapper(mapper: TimeMapper) {
    this.mapTime = mapper;
  }

  private followers(leaderId: PaneId) {
    if (!this.enabled) {
      return [];
    }

    return [...this.members].filter(([id]) => id !== leaderId);
  }

  private target(leaderId: PaneId, followerId: PaneId, follower: SyncMedia, time: number): FollowerTarget {
    const mapped = this.mapTime(leaderId, followerId, time);
    const end = Number.isFinite(follower.duration) && follower.duration > 0 ? follower.duration : Infinity;
    // A hair before the end counts as past it: the follower would end on its own a frame later.
    const outside = mapped.time < 0 || mapped.time >= end - 1e-3;

    return {
      time: Math.min(Math.max(0, mapped.time), end),
      rate: mapped.rate,
      outside,
    };
  }

  play(leaderId: PaneId) {
    const leader = this.members.get(leaderId);

    if (!leader) {
      return;
    }

    this.leaderId = leaderId;

    for (const [id, follower] of this.followers(leaderId)) {
      const target = this.target(leaderId, id, follower, leader.currentTime);
      follower.seek(target.time);
      follower.setRateMultiplier(target.rate);

      // A follower whose clip doesn't reach this moment yet waits at its first frame and starts
      // from onFrame once the leader gets there.
      if (!target.outside) {
        follower.play();
      }
    }

    leader.setRateMultiplier(1);
    leader.play();
  }

  /** Pauses every pane in place (used before jumping all panes to a position). */
  pauseAll() {
    this.members.forEach((media) => {
      media.pause();
      media.setRateMultiplier(1);
    });
    this.leaderId = null;
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
      follower.seek(this.target(leaderId, id, follower, leader.currentTime).time);
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
      follower.seek(this.target(leaderId, id, follower, time).time);
    }
  }

  /** Call for every presented frame of a playing pane; only the leader's frames correct. */
  onFrame(paneId: PaneId, time: number) {
    if (!this.enabled || paneId !== this.leaderId) {
      return;
    }

    for (const [id, follower] of this.followers(paneId)) {
      const target = this.target(paneId, id, follower, time);

      if (target.outside) {
        // Leader is before the follower clip's start or past its end: hold at that edge.
        if (!follower.paused) {
          follower.pause();
          follower.seek(target.time);
        }

        continue;
      }

      if (follower.paused) {
        // The leader just reached the part of the swing this clip covers.
        follower.seek(target.time);
        follower.setRateMultiplier(target.rate);
        follower.play();
        continue;
      }

      const correction = followerCorrection(target.time, follower.currentTime);

      if (correction.kind === "seek") {
        follower.seek(correction.time);
        follower.setRateMultiplier(target.rate);
      } else {
        follower.setRateMultiplier(target.rate * correction.multiplier);
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
