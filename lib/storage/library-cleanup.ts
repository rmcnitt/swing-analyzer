import type { AnalysisSession, VideoAsset } from "@/lib/types";

function sessionUsesVideo(session: AnalysisSession, videoId: string) {
  return (
    session.primaryVideoId === videoId ||
    session.secondaryVideoId === videoId ||
    session.panes.some((pane) => pane.videoId === videoId)
  );
}

/**
 * When a session is deleted, its own swing video goes with it unless another session still uses
 * it. References are kept: they're managed separately in the Library.
 */
export function videosOrphanedBySessionDelete(
  deleted: AnalysisSession,
  remainingSessions: AnalysisSession[],
  videos: VideoAsset[],
): string[] {
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const candidates = new Set(
    [deleted.primaryVideoId, deleted.secondaryVideoId, ...deleted.panes.map((pane) => pane.videoId)]
      .filter((id): id is string => Boolean(id)),
  );

  return [...candidates].filter((videoId) => {
    const video = videoById.get(videoId);

    return (
      video?.sourceType === "user" &&
      !remainingSessions.some((session) => session.id !== deleted.id && sessionUsesVideo(session, videoId))
    );
  });
}

export interface VideoDeletionPlan {
  /** Sessions built on this video (it's their primary swing); they can't exist without it. */
  deleteSessionIds: string[];
  /** Sessions that only had it loaded in the compare pane; the pane is cleared. */
  updatedSessions: AnalysisSession[];
}

export function planVideoDeletion(videoId: string, sessions: AnalysisSession[]): VideoDeletionPlan {
  const deleteSessionIds: string[] = [];
  const updatedSessions: AnalysisSession[] = [];

  for (const session of sessions) {
    if (session.primaryVideoId === videoId) {
      deleteSessionIds.push(session.id);
    } else if (sessionUsesVideo(session, videoId)) {
      updatedSessions.push({
        ...session,
        secondaryVideoId: session.secondaryVideoId === videoId ? undefined : session.secondaryVideoId,
        panes: session.panes.map((pane) =>
          pane.videoId === videoId ? { ...pane, videoId: undefined, label: "Comparison" } : pane,
        ),
      });
    }
  }

  return { deleteSessionIds, updatedSessions };
}
