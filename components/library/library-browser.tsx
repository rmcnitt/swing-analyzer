"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Columns2, FileVideo, Search } from "lucide-react";
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
import type { SwingOrientation, VideoAsset } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/utils";

const byLastOpened = <T extends { lastOpenedAt: string }>(a: T, b: T) =>
  new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime();

export function LibraryBrowser() {
  const library = useLocalLibrary();
  const [query, setQuery] = useState("");
  const [storageVersion, setStorageVersion] = useState(0);

  const videoById = useMemo(
    () => new Map(library.videos.map((video) => [video.id, video])),
    [library.videos],
  );
  const sessions = [...library.sessions].sort(byLastOpened);
  // "Add to compare" opens the most recently used session with the reference in the second pane.
  const compareSessionId = sessions[0]?.id ?? "sample-session";
  const refreshStorage = () => setStorageVersion((current) => current + 1);

  const needle = query.trim().toLowerCase();
  const matches = (...fields: Array<string | undefined>) =>
    fields.join(" ").toLowerCase().includes(needle);
  const mySwings = sessions.filter((session) => {
    const video = videoById.get(session.primaryVideoId);
    return matches(session.title, video?.clubTag, video?.orientation);
  });
  const references = library.videos.filter(
    (video) =>
      video.sourceType === "reference" &&
      matches(video.title, video.ownerName, video.clubTag, video.orientation),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Library</h1>
          <div className="mt-2">
            <StorageMeter version={storageVersion} />
          </div>
        </div>

        <label className="flex h-9 w-full items-center gap-2 rounded-control border border-border bg-surface-1 px-2.5 text-sm text-text-muted sm:w-72 pointer-coarse:h-10">
          <Search className="size-4" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, club or view"
            aria-label="Search the library"
            className="min-w-0 flex-1 bg-transparent text-text placeholder:text-text-muted"
          />
        </label>
      </header>

      <LibrarySection title="My swings" count={mySwings.length}>
        {mySwings.length === 0 ? (
          <EmptyLine>
            {needle ? "No swings match." : "No swings yet."}{" "}
            {needle ? null : (
              <Link href="/" className="text-text underline underline-offset-4">
                Upload your swing
              </Link>
            )}
          </EmptyLine>
        ) : (
          <CardGrid>
            {mySwings.map((session) => {
              const video = videoById.get(session.primaryVideoId);

              return (
                <SwingCard
                  key={session.id}
                  href={`/analysis/${session.id}`}
                  openLabel={`Open ${session.title}`}
                  video={video}
                  title={
                    <InlineRename
                      value={session.title}
                      label="session"
                      onSave={(title) => void renameStoredSession(session.id, title).then(library.reload)}
                    />
                  }
                  meta={formatDate(session.lastOpenedAt)}
                  actions={
                    <>
                      <Link
                        href={`/analysis/${session.id}?compare=true`}
                        className={secondaryButton}
                      >
                        <Columns2 className="size-3.5" aria-hidden />
                        Compare
                      </Link>
                      <ConfirmDeleteButton
                        label={session.title}
                        consequence="Deletes this session and its video from this browser."
                        onConfirm={async () => {
                          await deleteStoredSession(session.id);
                          await library.reload();
                          refreshStorage();
                        }}
                      />
                    </>
                  }
                />
              );
            })}
          </CardGrid>
        )}
      </LibrarySection>

      <LibrarySection id="references" title="References" count={references.length}>
        {references.length === 0 ? (
          <EmptyLine>
            {needle
              ? "No references match."
              : "No references yet. Upload a model swing and turn on “Save as reference” to compare against it."}
          </EmptyLine>
        ) : (
          <CardGrid>
            {references.map((video) => {
              const compareHref = `/analysis/${compareSessionId}?compare=true&ref=${encodeURIComponent(video.id)}`;

              return (
                <SwingCard
                  key={video.id}
                  href={compareHref}
                  openLabel={`Compare against ${video.title}`}
                  video={video}
                  title={
                    <InlineRename
                      value={video.title}
                      label="reference"
                      onSave={(title) =>
                        void updateStoredVideoMetadata(video.id, { title }).then(library.reload)
                      }
                    />
                  }
                  meta={`Added ${formatDate(video.createdAt)}`}
                  actions={
                    <>
                      <Link href={compareHref} className={secondaryButton}>
                        <Columns2 className="size-3.5" aria-hidden />
                        Add to compare
                      </Link>
                      <ConfirmDeleteButton
                        label={video.title}
                        consequence="Deletes this clip. Sessions comparing against it keep their work."
                        onConfirm={async () => {
                          await deleteStoredVideo(video.id);
                          await library.reload();
                          refreshStorage();
                        }}
                      />
                    </>
                  }
                />
              );
            })}
          </CardGrid>
        )}
      </LibrarySection>
    </main>
  );
}

const secondaryButton =
  "inline-flex h-8 items-center gap-1.5 rounded-control border border-border px-2.5 text-xs text-text hover:border-border-strong pointer-coarse:h-10";

function LibrarySection({
  id,
  title,
  count,
  children,
}: {
  id?: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-16" aria-label={title}>
      <h2 className="flex items-baseline gap-2 border-b border-border pb-2 text-xs uppercase tracking-caps text-text-muted">
        {title}
        <span className="font-mono text-text-muted">{count}</span>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

/** A clip as filmed (portrait or landscape, never cropped), its name, date, club and view. */
function SwingCard({
  href,
  openLabel,
  video,
  title,
  meta,
  actions,
}: {
  href: string;
  openLabel: string;
  video?: VideoAsset;
  title: ReactNode;
  meta: string;
  actions: ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col">
      <Link
        href={href}
        aria-label={openLabel}
        className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-panel border border-border bg-bg text-text-faint hover:border-border-strong"
      >
        {video?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <FileVideo className="size-5" aria-hidden />
        )}
        {video ? (
          <span className="absolute bottom-1.5 right-1.5 rounded-control bg-bg/80 px-1.5 py-0.5 font-mono text-xs text-text">
            {formatDuration(video.duration)}
          </span>
        ) : null}
      </Link>

      <div className="mt-2.5 min-w-0">{title}</div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <span>{meta}</span>
        {video?.clubTag ? <span>{video.clubTag}</span> : null}
        {video?.orientation ? <ViewTag orientation={video.orientation} /> : null}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{actions}</div>
    </article>
  );
}

/** The camera view, the same short mono tag everywhere. */
export function ViewTag({ orientation }: { orientation: SwingOrientation }) {
  return (
    <span className="rounded-control border border-border px-1.5 font-mono text-xs uppercase text-text-muted">
      {orientation === "down-the-line" ? "DTL" : "Face-on"}
    </span>
  );
}
