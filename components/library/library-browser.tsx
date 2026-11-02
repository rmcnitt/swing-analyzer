"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Columns2, FileVideo, Play, Search, Star } from "lucide-react";
import { ProSwingCard } from "@/components/library/pro-swing-card";
import {
  initializeLocalLibrary,
  loadStoredSessions,
  loadStoredVideos,
} from "@/lib/storage/session-storage";
import {
  applyProSwingOverrides,
  loadProSwingOverrides,
  saveProSwingOverride,
} from "@/lib/storage/pro-swing-overrides";
import type { AnalysisSession, ProSwingReference, VideoAsset } from "@/lib/types";
import { cn, formatDate, formatDuration } from "@/lib/utils";

interface LibraryBrowserProps {
  sessions: AnalysisSession[];
  videos: VideoAsset[];
  proSwings: ProSwingReference[];
}

type LibraryTab = "my-swings" | "pro" | "recent";

export function LibraryBrowser({ sessions, videos, proSwings }: LibraryBrowserProps) {
  const [storedSessions, setStoredSessions] = useState<AnalysisSession[]>([]);
  const [storedVideos, setStoredVideos] = useState<VideoAsset[]>([]);
  const [activeTab, setActiveTab] = useState<LibraryTab>("my-swings");
  const [query, setQuery] = useState("");
  const [proSwingOverrides, setProSwingOverrides] = useState(loadProSwingOverrides);

  useEffect(() => {
    void initializeLocalLibrary({
      sessions,
      videos,
    }).then(async () => {
      const [nextSessions, nextVideos] = await Promise.all([
        loadStoredSessions(),
        loadStoredVideos(),
      ]);

      setStoredSessions(nextSessions);
      setStoredVideos(nextVideos);
    });
  }, [sessions, videos]);

  const allVideos = useMemo(() => uniqueVideos([...storedVideos, ...videos]), [storedVideos, videos]);
  const allSessions = useMemo(
    () => uniqueSessions([...storedSessions, ...sessions]),
    [sessions, storedSessions],
  );
  const videoById = useMemo(
    () => new Map(allVideos.map((video) => [video.id, video])),
    [allVideos],
  );
  const compareSessionId = allSessions[0]?.id ?? "session-driver-checkpoint";
  const effectiveProSwings = useMemo(
    () => applyProSwingOverrides(proSwings, proSwingOverrides),
    [proSwings, proSwingOverrides],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSessions = allSessions.filter((session) => {
    const video = videoById.get(session.primaryVideoId);
    const haystack = `${session.title} ${video?.clubTag ?? ""} ${video?.orientation ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const filteredProSwings = effectiveProSwings.filter((swing) => {
    const haystack =
      `${swing.player} ${swing.title} ${swing.club} ${swing.viewAngle} ${swing.tags.join(" ")}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const recentSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-4 lg:px-6">
      <section className="border border-[color:var(--color-border)] bg-[#0f1012]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-3 py-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
              Media bin
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">Video library</h1>
          </div>

          <label className="flex h-8 min-w-64 items-center gap-2 border border-[color:var(--color-border)] bg-black/30 px-2.5 text-sm text-[color:var(--color-muted)]">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search swings, clubs, tags"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-600"
            />
          </label>
        </div>

        <div className="flex flex-wrap border-b border-[color:var(--color-border)]">
          {[
            { id: "my-swings" as const, label: "My swings", count: filteredSessions.length },
            { id: "pro" as const, label: "Pro references", count: filteredProSwings.length },
            { id: "recent" as const, label: "Recently used", count: recentSessions.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-9 border-r border-[color:var(--color-border)] px-3 text-sm",
                activeTab === tab.id
                  ? "bg-[color:var(--color-accent)]/14 text-white"
                  : "text-[color:var(--color-muted)] hover:bg-white/[0.04] hover:text-white",
              )}
            >
              {tab.label} <span className="font-mono text-xs opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>

        {activeTab === "pro" ? (
          <div className="grid gap-2 p-2.5 xl:grid-cols-2">
            {filteredProSwings.map((swing) => (
              <ProSwingCard
                key={swing.id}
                swing={swing}
                compareSessionId={compareSessionId}
                onSaveOverride={(id, override) => {
                  setProSwingOverrides(saveProSwingOverride(id, override));
                }}
              />
            ))}
          </div>
        ) : (
          <SessionTable
            sessions={activeTab === "recent" ? recentSessions : filteredSessions}
            videoById={videoById}
            showRecentMarker={activeTab === "recent"}
          />
        )}
      </section>
    </main>
  );
}

function SessionTable({
  sessions,
  videoById,
  showRecentMarker,
}: {
  sessions: AnalysisSession[];
  videoById: Map<string, VideoAsset>;
  showRecentMarker: boolean;
}) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_90px_132px] border-b border-[color:var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)] max-lg:hidden">
        <span>Video</span>
        <span>Club</span>
        <span>View</span>
        <span>Media</span>
        <span className="text-right">Actions</span>
      </div>

      <div className="divide-y divide-[color:var(--color-border)]">
        {sessions.map((session) => {
          const video = videoById.get(session.primaryVideoId);

          return (
            <article
              key={session.id}
              className="grid gap-3 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_110px_90px_132px] lg:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden bg-black text-[color:var(--color-accent)]">
                  {video?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover opacity-85"
                    />
                  ) : (
                    <FileVideo className="size-5" />
                  )}
                  {video ? (
                    <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {formatDuration(video.duration)}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-white">{session.title}</h2>
                    {showRecentMarker ? <Star className="size-3.5 text-[color:var(--color-accent)]" /> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-[color:var(--color-muted)]">
                    {formatDate(session.lastOpenedAt)} / {session.snapshotMarkers.length} markers
                  </p>
                </div>
              </div>

              <p className="text-sm text-[color:var(--color-muted)]">{video?.clubTag ?? "Swing"}</p>
              <p className="text-sm text-[color:var(--color-muted)]">
                {video?.orientation === "down-the-line" ? "Down line" : "Face-on"}
              </p>
              <p className="font-mono text-xs text-[color:var(--color-muted)]">
                {video ? `${video.fps ?? 60} fps` : "Local"}
              </p>
              <div className="flex justify-start gap-2 lg:justify-end">
                <Link
                  href={`/analysis/${session.id}`}
                  className="flex h-8 items-center gap-1.5 border border-[color:var(--color-border)] px-2.5 text-xs text-white hover:border-[color:var(--color-accent)]"
                >
                  <Play className="size-3.5" />
                  Open
                </Link>
                <Link
                  href={`/analysis/${session.id}?compare=true`}
                  className="flex h-8 items-center gap-1.5 bg-[color:var(--color-accent)] px-2.5 text-xs font-semibold text-[color:var(--color-ink)]"
                >
                  <Columns2 className="size-3.5" />
                  Compare
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function uniqueVideos(videos: VideoAsset[]) {
  const seen = new Set<string>();

  return videos.filter((video) => {
    if (seen.has(video.id)) {
      return false;
    }

    seen.add(video.id);
    return true;
  });
}

function uniqueSessions(sessions: AnalysisSession[]) {
  const seen = new Set<string>();

  return sessions.filter((session) => {
    if (seen.has(session.id)) {
      return false;
    }

    seen.add(session.id);
    return true;
  });
}
