import type { ProSwingReference, VideoAsset } from "@/lib/types";
import { generatedProSwingReferences } from "@/lib/data/pro-swings.generated";

export const proSwingReferences: ProSwingReference[] = generatedProSwingReferences;

export function proSwingToVideoAsset(reference: ProSwingReference): VideoAsset {
  return {
    id: `video-${reference.id}`,
    title: reference.title,
    url: reference.videoUrl,
    thumbnailUrl: reference.thumbnailUrl,
    ownerId: "pro-library",
    ownerName: reference.player,
    sourceType: "pro",
    duration: reference.duration,
    fps: reference.fps,
    orientation: reference.viewAngle,
    clubTag: reference.club,
    uploadStatus: "ready",
    createdAt: "2026-04-03T14:00:00.000Z",
  };
}
