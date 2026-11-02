import { clamp } from "@/lib/utils";

export interface SyncResult {
  shouldSeek: boolean;
  nextTime: number;
}

export function shouldSyncToLeader(
  leaderTime: number,
  followerTime: number,
  threshold = 0.08,
): SyncResult {
  const delta = Math.abs(leaderTime - followerTime);

  if (delta <= threshold) {
    return {
      shouldSeek: false,
      nextTime: followerTime,
    };
  }

  return {
    shouldSeek: true,
    nextTime: clamp(leaderTime, 0, Number.MAX_SAFE_INTEGER),
  };
}
