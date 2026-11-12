"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Columns2, FileVideo, Play, Search, Star } from "lucide-react";
import {
  ConfirmDeleteButton,
  InlineRename,
  StorageMeter,
} from "@/components/library/library-actions";
import {
  deleteStoredSession,
  deleteStoredVideo,
  renameStoredSession,
  updateStoredVideoMetadata,
} from "@/lib/storage/session-storage";
import { useLocalLibrary } from "@/lib/storage/use-stored-videos";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { cn, formatDate, formatDuration } from "@/lib/utils";

type LibraryTab = "my-swings" | "references" | "recent";

export function LibraryBrowser() {
  const library = useLocalLibrary();
  const [activeTab, setActiveTab] = useState<LibraryTab>("my-swings");
  const [query, setQuery] = useState("");
  const [storageVersion, setStorageVersion] = useState(0);

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
  const mostRecentSession = [...allSessions].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  )[0];
  const compareSessionId = mostRecentSession?.id ?? "sample-session";
  const actions: LibraryActions = {
    renameSession: (id, title) => renameStoredSession(id, title).then(library.reload),
    deleteSession: async (id) => {
      await deleteStoredSession(id);
      await library.reload();
      setStorageVersion((current) => current + 1);
    },
    renameVideo: (id, title) => updateStoredVideoMetadata(id, { title }).then(library.reload),
    deleteVideo: async (id) => {
      await deleteStoredVideo(id);
      await library.reload();
      setStorageVersion((current) => current + 1);
    },
  };
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
      <section className="overflow-hidden rounded-panel border border-border bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
          <div>
            <p className="text-xs uppercase tracking-caps text-text-muted">
              Media bin
            </p>
            <h1 className="mt-1 text-xl font-semibold text-text">Video library</h1>
            <div className="mt-1.5">
              <StorageMeter version={storageVersion} />
            </div>
          </div>

          <label className="flex h-8 min-w-64 items-center gap-2 border border-border bg-bg/30 px-2.5 text-sm text-text-muted">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search swings, clubs, tags"
              className="min-w-0 flex-1 bg-transparent text-text placeholder:text-text-muted"
            />
          </label>
        </div>

        <div className="flex flex-wrap border-b border-border">
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
                "h-9 border-r border-border px-3 text-sm",
                activeTab === tab.id
                  ? "bg-accent-dim text-text"
                  : "text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {tab.label} <span className="font-mono text-xs opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>

        {activeTab === "references" ? (
          <ReferenceTable
            references={filteredReferences}
            compareSessionId={compareSessionId}
            actions={actions}
          />
        ) : (
          <SessionTable
            sessions={activeTab === "recent" ? recentSessions : filteredSessions}
            videoById={videoById}
            showRecentMarker={activeTab === "recent"}
            actions={actions}
          />
        )}
      </section>
    </main>
  );
}

interface LibraryActions {
  renameSession: (id: string, title: string) => Promise<unknown>;
  deleteSession: (id: string) => Promise<unknown>;
  renameVideo: (id: string, title: string) => Promise<unknown>;
  deleteVideo: (id: string) => Promise<unknown>;
}

const rowGrid = "lg:grid-cols-[minmax(0,1fr)_100px_100px_70px_250px]";

function SessionTable({
  sessions,
  videoById,
  showRecentMarker,
  actions,
}: {
  sessions: AnalysisSession[];
  videoById: Map<string, VideoAsset>;
  showRecentMarker: boolean;
  actions: LibraryActions;
}) {
  if (sessions.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-text-muted">
        No swings yet.{" "}
        <Link href="/" className="text-accent underline">
          Import one
        </Link>{" "}
        to get started.
      </p>
    );
  }

  return (
    <div>
      <div className={`grid ${rowGrid} border-b border-border px-3 py-2 text-xs uppercase tracking-caps text-text-muted max-lg:hidden`}>
        <span>Video</span>
        <span>Club</span>
        <span>View</span>
        <span>Media</span>
        <span className="text-right">Actions</span>
      </div>

      <div className="divide-y divide-border">
        {sessions.map((session) => {
          const video = videoById.get(session.primaryVideoId);

          return (
            <article
              key={session.id}
              className={`grid gap-3 px-3 py-2.5 ${rowGrid} lg:items-center`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <VideoThumbnail video={video} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <InlineRename
                      value={session.title}
                      label="session"
                      onSave={(title) => void actions.renameSession(session.id, title)}
                    />
                    {showRecentMarker ? <Star className="size-3.5 text-accent" /> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-text-muted">
                    {formatDate(session.lastOpenedAt)} / {session.snapshotMarkers.length} markers
                  </p>
                </div>
              </div>

              <p className="text-sm text-text-muted">{video?.clubTag ?? "Swing"}</p>
              <p className="text-sm text-text-muted">
                {video?.orientation === "down-the-line" ? "Down line" : "Face-on"}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {video ? `${video.fps ?? 60} fps` : "Local"}
              </p>
              <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                <Link
                  href={`/analysis/${session.id}`}
                  className="flex h-8 items-center gap-1.5 border border-border px-2.5 text-xs text-text hover:border-accent"
                >
                  <Play className="size-3.5" />
                  Open
                </Link>
                <Link
                  href={`/analysis/${session.id}?compare=true`}
                  className="flex h-8 items-center gap-1.5 border border-border px-2.5 text-xs text-text hover:border-border-strong"
                >
                  <Columns2 className="size-3.5" />
                  Compare
                </Link>
                <ConfirmDeleteButton
                  label={session.title}
                  consequence="Deletes this session and its video from this browser."
                  onConfirm={() => actions.deleteSession(session.id)}
                />
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
  actions,
}: {
  references: VideoAsset[];
  compareSessionId: string;
  actions: LibraryActions;
}) {
  if (references.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-text-muted">
        No references yet. Import a clip from the{" "}
        <Link href="/" className="text-accent underline">
          home screen
        </Link>{" "}
        and turn on &ldquo;Save as reference&rdquo; to compare your swing against it.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {references.map((video) => (
        <article
          key={video.id}
          className={`grid gap-3 px-3 py-2.5 ${rowGrid} lg:items-center`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <VideoThumbnail video={video} />
            <div className="min-w-0">
              <InlineRename
                value={video.title}
                label="reference"
                onSave={(title) => void actions.renameVideo(video.id, title)}
              />
              <p className="mt-1 truncate text-xs text-text-muted">
                Added {formatDate(video.createdAt)}
              </p>
            </div>
          </div>
          <p className="text-sm text-text-muted">{video.clubTag}</p>
          <p className="text-sm text-text-muted">
            {video.orientation === "down-the-line" ? "Down line" : "Face-on"}
          </p>
          <p className="font-mono text-xs text-text-muted">{video.fps ?? 60} fps</p>
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <Link
              href={`/analysis/${compareSessionId}?compare=true&ref=${encodeURIComponent(video.id)}`}
              className="flex h-8 items-center gap-1.5 border border-border px-2.5 text-xs text-text hover:border-border-strong"
            >
              <Columns2 className="size-3.5" />
              Add to compare
            </Link>
            <ConfirmDeleteButton
              label={video.title}
              consequence="Deletes this clip. Sessions comparing against it keep their work."
              onConfirm={() => actions.deleteVideo(video.id)}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function VideoThumbnail({ video }: { video?: VideoAsset }) {
  return (
    <div className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden bg-bg text-accent">
      {video?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-85" />
      ) : (
        <FileVideo className="size-5" />
      )}
      {video ? (
        <span className="absolute bottom-1 right-1 bg-bg/75 px-1.5 py-0.5 font-mono text-xs text-text">
          {formatDuration(video.duration)}
        </span>
      ) : null}
    </div>
  );
}
