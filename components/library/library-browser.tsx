"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Columns2, FileVideo, Play, Search, Star } from "lucide-react";
import { useLocalLibrary } from "@/lib/storage/use-stored-videos";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { cn, formatDate, formatDuration } from "@/lib/utils";

type LibraryTab = "my-swings" | "references" | "recent";

export function LibraryBrowser() {
  const library = useLocalLibrary();
  const [activeTab, setActiveTab] = useState<LibraryTab>("my-swings");
  const [query, setQuery] = useState("");

  useEffect(() => {
    // Read ?tab= after mount (not during render) so the static page hydrates cleanly.
    if (new URLSearchParams(window.location.search).get("tab") === "references") {
      void Promise.resolve().then(() => setActiveTab("references"));
    }
  }, []);

  const allVideos = library.videos;
  const allSessions = library.sessions;
  const videoById = useMemo(
    () => new Map(allVideos.map((video) => [video.id, video])),
    [allVideos],
  );
  const compareSessionId = allSessions[0]?.id ?? "sample-session";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSessions = allSessions.filter((session) => {
    const video = videoById.get(session.primaryVideoId);
    const haystack = `${session.title} ${video?.clubTag ?? ""} ${video?.orientation ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const filteredReferences = allVideos.filter((video) => {
    const haystack =
      `${video.title} ${video.ownerName} ${video.clubTag} ${video.orientation}`.toLowerCase();
    return video.sourceType === "reference" && haystack.includes(normalizedQuery);
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
            { id: "references" as const, label: "References", count: filteredReferences.length },
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

        {activeTab === "references" ? (
          <ReferenceTable references={filteredReferences} compareSessionId={compareSessionId} />
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
                <VideoThumbnail video={video} />
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

function ReferenceTable({
  references,
  compareSessionId,
}: {
  references: VideoAsset[];
  compareSessionId: string;
}) {
  if (references.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-[color:var(--color-muted)]">
        No references yet. Import a clip from the{" "}
        <Link href="/" className="text-[color:var(--color-accent)] underline">
          home screen
        </Link>{" "}
        and turn on &ldquo;Save as reference&rdquo; to compare your swing against it.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[color:var(--color-border)]">
      {references.map((video) => (
        <article
          key={video.id}
          className="grid gap-3 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_110px_90px_132px] lg:items-center"
        >
          <div className="flex min-w-0 items-center gap-3">
            <VideoThumbnail video={video} />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">{video.title}</h2>
              <p className="mt-1 truncate text-xs text-[color:var(--color-muted)]">
                Added {formatDate(video.createdAt)}
              </p>
            </div>
          </div>
          <p className="text-sm text-[color:var(--color-muted)]">{video.clubTag}</p>
          <p className="text-sm text-[color:var(--color-muted)]">
            {video.orientation === "down-the-line" ? "Down line" : "Face-on"}
          </p>
          <p className="font-mono text-xs text-[color:var(--color-muted)]">{video.fps ?? 60} fps</p>
          <div className="flex justify-start gap-2 lg:justify-end">
            <Link
              href={`/analysis/${compareSessionId}?compare=true&ref=${encodeURIComponent(video.id)}`}
              className="flex h-8 items-center gap-1.5 bg-[color:var(--color-accent)] px-2.5 text-xs font-semibold text-[color:var(--color-ink)]"
            >
              <Columns2 className="size-3.5" />
              Add to compare
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function VideoThumbnail({ video }: { video?: VideoAsset }) {
  return (
    <div className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden bg-black text-[color:var(--color-accent)]">
      {video?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-85" />
      ) : (
        <FileVideo className="size-5" />
      )}
      {video ? (
        <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {formatDuration(video.duration)}
        </span>
      ) : null}
    </div>
  );
}
