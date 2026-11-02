import { mockDashboard, mockSessions, mockVideos } from "@/lib/mock-data";
import { proSwingReferences, proSwingToVideoAsset } from "@/lib/data/pro-swings";
import type { AnalysisSession, DashboardData, ProSwingReference, VideoAsset } from "@/lib/types";

function findVideo(videoId?: string) {
  return [...mockVideos, ...proSwingReferences.map(proSwingToVideoAsset)].find(
    (video) => video.id === videoId,
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  return {
    ...mockDashboard,
    proSwings: proSwingReferences,
  };
}

export async function getAllVideos(): Promise<VideoAsset[]> {
  return mockVideos;
}

export async function getSessionById(sessionId: string): Promise<AnalysisSession | null> {
  return mockSessions.find((session) => session.id === sessionId) ?? null;
}

export async function getProSwings(): Promise<ProSwingReference[]> {
  return proSwingReferences;
}

export async function getVideoById(videoId?: string) {
  return findVideo(videoId);
}
