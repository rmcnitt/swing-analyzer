"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Columns2,
  FileVideo,
  FolderOpen,
  Play,
  UploadCloud,
  X,
} from "lucide-react";
import {
  ConfirmDeleteButton,
  InlineRename,
  StorageMeter,
} from "@/components/library/library-actions";
import {
  deleteStoredSession,
  renameStoredSession,
  requestPersistentStorage,
  saveStoredSession,
  saveStoredVideo,
} from "@/lib/storage/session-storage";
import { useLocalLibrary } from "@/lib/storage/use-stored-videos";
import type { AnalysisSession, SwingOrientation, VideoAsset } from "@/lib/types";
import { createId, formatDate, formatDuration } from "@/lib/utils";
import { PlaybackProblemNotice } from "@/components/analysis/playback-problem-notice";
import { DEFAULT_FPS, frameRateChoices } from "@/lib/analysis/frames";
import { createVideoThumbnail, detectVideoFps, readVideoMetadata, type VideoFileMetadata } from "@/lib/video/media";

const clubOptions = [
  "Driver",
  "3 Wood",
  "Hybrid",
  "4 Iron",
  "5 Iron",
  "6 Iron",
  "7 Iron",
  "8 Iron",
  "9 Iron",
  "PW",
  "Wedge",
  "Putter",
];

export function SwingHub() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const library = useLocalLibrary();
  const [storageVersion, setStorageVersion] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoFileMetadata | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [club, setClub] = useState("7 Iron");
  const [orientation, setOrientation] = useState<SwingOrientation>("face-on");
  const [notes, setNotes] = useState("");
  const [fps, setFps] = useState(DEFAULT_FPS);
  /** "detecting" while measuring; afterwards whether the current value is measured or chosen. */
  const [fpsSource, setFpsSource] = useState<"detecting" | "detected" | "manual" | "default">(
    "default",
  );
  const [isImporting, setIsImporting] = useState(false);
  const [saveAsReference, setSaveAsReference] = useState(false);
  const [savedReferenceTitle, setSavedReferenceTitle] = useState<string | null>(null);

  // The import preview URL is revoked when replaced, cancelled, or on unmount.
  const previewUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    },
    [],
  );

  const allVideos = library.videos;
  const allSessions = library.sessions;

  const videoById = useMemo(
    () => new Map(allVideos.map((video) => [video.id, video])),
    [allVideos],
  );

  const recentSessions = [...allSessions].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  );

  const handleSelectFile = async (file: File) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    const nextMetadata = await readVideoMetadata(nextPreviewUrl);
    const baseName = file.name.replace(/\.[^.]+$/, "");

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setMetadata(nextMetadata);
    setSessionName(baseName || "Range swing");
    setSavedReferenceTitle(null);
    setFps(DEFAULT_FPS);
    setFpsSource("detecting");

    const detected = await detectVideoFps(nextPreviewUrl);

    // Ignore results for a file the user has since replaced or cancelled.
    if (previewUrlRef.current !== nextPreviewUrl) {
      return;
    }

    if (detected) {
      setFps(detected);
    }

    setFpsSource((current) =>
      current === "detecting" ? (detected ? "detected" : "default") : current,
    );
  };

  const handleCancelImport = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setMetadata(null);
    setSessionName("");
    setNotes("");
    setSaveAsReference(false);
    setIsImporting(false);
  };

  const handleCreateSession = async () => {
    if (!selectedFile || !previewUrl || !metadata || metadata.problem || isImporting) {
      return;
    }

    setIsImporting(true);

    const now = new Date().toISOString();
    const videoId = createId("local-video");
    const sessionId = createId("local-session");
    const video: VideoAsset = {
      id: videoId,
      title: sessionName.trim() || selectedFile.name.replace(/\.[^.]+$/, "") || "Imported swing",
      description: notes.trim() || undefined,
      url: previewUrl,
      ownerId: "user-demo",
      ownerName: saveAsReference ? "Reference" : "Local library",
      sourceType: saveAsReference ? "reference" : "user",
      duration: metadata.duration,
      fps,
      fpsSource:
        fpsSource === "detected" || fpsSource === "manual" ? fpsSource : undefined,
      width: metadata.width,
      height: metadata.height,
      orientation,
      clubTag: club,
      mimeType: selectedFile.type || undefined,
      uploadStatus: "ready",
      createdAt: now,
    };
    const thumbnail = await createVideoThumbnail(previewUrl);

    await saveStoredVideo(video, selectedFile, thumbnail);
    void requestPersistentStorage();

    if (saveAsReference) {
      // References don't get their own session; they're loaded into a compare pane.
      await library.reload();
      setStorageVersion((current) => current + 1);
      handleCancelImport();
      setSavedReferenceTitle(video.title);
      return;
    }

    const session: AnalysisSession = {
      id: sessionId,
      userId: "user-demo",
      title: video.title,
      primaryVideoId: videoId,
      syncEnabled: false,
      playbackDefaults: {
        speed: 0.5,
      },
      notes,
      lastOpenedAt: now,
      panes: [
        {
          id: "primary",
          label: "My swing",
          videoId,
          overlayVisible: true,
          playbackRate: 0.5,
          currentTime: 0,
        },
        {
          id: "secondary",
          label: "Comparison",
          overlayVisible: true,
          playbackRate: 0.5,
          currentTime: 0,
        },
      ],
      annotations: {
        primary: [],
        secondary: [],
      },
      snapshotMarkers: [],
    };

    await saveStoredSession(session);
    router.push(`/analysis/${sessionId}`);
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-6">
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-panel border border-border bg-surface-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-caps text-text-muted">
                Swing library
              </p>
              <h1 className="mt-1 text-xl font-semibold text-text">Recent swings</h1>
              <div className="mt-1.5">
                <StorageMeter version={storageVersion} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 bg-accent px-3 text-sm font-semibold text-bg"
            >
              <UploadCloud className="size-4" />
              Import swing
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void handleSelectFile(file);
                }
              }}
            />
          </div>
        </div>

        <div className="rounded-panel border border-border bg-surface-1 p-3">
          <p className="text-xs uppercase tracking-caps text-text-muted">
            Quick actions
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={`/analysis/${recentSessions[0]?.id ?? "sample-session"}`}
              className="flex h-9 items-center justify-center gap-2 border border-border text-xs text-text hover:border-accent"
            >
              <FolderOpen className="size-4" />
              Open latest
            </Link>
            <Link
              href={`/analysis/${recentSessions[0]?.id ?? "sample-session"}?compare=true`}
              className="flex h-9 items-center justify-center gap-2 border border-border text-xs text-text hover:border-accent"
            >
              <Columns2 className="size-4" />
              Compare
            </Link>
          </div>
        </div>
      </section>

      {selectedFile ? (
        <section className="grid gap-3 rounded-panel border border-accent bg-surface-1 p-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="overflow-hidden bg-bg">
            {previewUrl ? (
              <video src={previewUrl} className="aspect-video w-full object-contain" muted playsInline />
            ) : null}
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-caps text-text-muted">
                  Import setup
                </p>
                <h2 className="mt-1 text-base font-semibold text-text">{selectedFile.name}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {metadata ? formatDuration(metadata.duration) : "Reading video"} / local browser library
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelImport}
                className="flex size-8 items-center justify-center border border-border text-text-muted hover:text-text"
                aria-label="Cancel import"
              >
                <X className="size-4" />
              </button>
            </div>

            {metadata?.problem ? (
              <PlaybackProblemNotice
                className="mt-3"
                problem={metadata.problem}
                fileName={selectedFile.name}
                mimeType={selectedFile.type}
              />
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-text-muted">
                  {saveAsReference ? "Reference name" : "Session name"}
                </span>
                <input
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  className="mt-1 h-9 w-full border border-border bg-bg px-2.5 text-sm text-text focus:border-border-strong"
                />
              </label>

              <label className="block">
                <span className="text-xs text-text-muted">Club</span>
                <select
                  value={club}
                  onChange={(event) => setClub(event.target.value)}
                  className="mt-1 h-9 w-full border border-border bg-bg px-2.5 text-sm text-text focus:border-border-strong"
                >
                  {clubOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="text-xs text-text-muted">View angle</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["face-on", "down-the-line"] as SwingOrientation[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOrientation(option)}
                      className={`h-9 border px-3 text-sm ${
                        orientation === option
                          ? "border-accent bg-accent-dim text-text"
                          : "border-border text-text-muted"
                      }`}
                    >
                      {option === "face-on" ? "Face-on" : "Down-the-line"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="text-xs text-text-muted">
                  Frame rate{" "}
                  <span className="text-xs">
                    {fpsSource === "detecting"
                      ? "(detecting…)"
                      : fpsSource === "detected"
                        ? "(detected)"
                        : fpsSource === "default"
                          ? "(couldn't detect; set it for accurate frame stepping)"
                          : ""}
                  </span>
                </span>
                <select
                  value={fps}
                  onChange={(event) => {
                    setFps(Number(event.target.value));
                    setFpsSource("manual");
                  }}
                  className="mt-1 h-9 w-full border border-border bg-bg px-2.5 text-sm text-text focus:border-border-strong"
                >
                  {frameRateChoices(fps).map((option) => (
                    <option key={option} value={option}>
                      {option} fps
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-text-muted">Notes / tags</span>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Tempo, takeaway, impact..."
                  className="mt-1 h-9 w-full border border-border bg-bg px-2.5 text-sm text-text placeholder:text-text-muted focus:border-border-strong"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={saveAsReference}
                  onChange={(event) => setSaveAsReference(event.target.checked)}
                  className="size-4 accent-accent"
                />
                Save as reference
                <span className="text-xs text-text-muted">
                  (a model swing to compare against)
                </span>
              </label>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isImporting || Boolean(metadata?.problem)}
                className="inline-flex h-9 items-center gap-2 bg-accent px-3 text-sm font-semibold text-bg disabled:opacity-60"
              >
                <Play className="size-4" />
                {saveAsReference ? "Save reference" : "Open analysis"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {savedReferenceTitle ? (
        <p className="border border-border bg-surface-1 px-3 py-2 text-sm text-text">
          Saved &ldquo;{savedReferenceTitle}&rdquo; to{" "}
          <Link href="/library?tab=references" className="text-accent underline">
            References
          </Link>
          . Load it into the compare pane from any session.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-panel border border-border bg-surface-1">
        <div className="grid grid-cols-[minmax(0,1fr)_110px_100px_230px] border-b border-border px-3 py-2 text-xs uppercase tracking-caps text-text-muted max-lg:hidden">
          <span>Swing</span>
          <span>Club</span>
          <span>View</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-border">
          {recentSessions.map((session) => {
            const video = videoById.get(session.primaryVideoId);

            return (
              <article
                key={session.id}
                className="grid gap-3 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_100px_230px] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden bg-bg text-accent">
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
                  </div>
                  <div className="min-w-0">
                    <InlineRename
                      value={session.title}
                      label="session"
                      onSave={(title) => void renameStoredSession(session.id, title).then(library.reload)}
                    />
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {formatDate(session.lastOpenedAt)} / {video ? formatDuration(video.duration) : "0:00"} /{" "}
                      {session.snapshotMarkers.length} markers
                    </p>
                  </div>
                </div>

                <p className="text-sm text-text-muted">{video?.clubTag ?? "Swing"}</p>
                <p className="text-sm text-text-muted">
                  {video?.orientation === "down-the-line" ? "DTL" : "Face-on"}
                </p>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Link
                    href={`/analysis/${session.id}`}
                    className="flex h-8 items-center justify-center border border-border px-3 text-xs text-text hover:border-accent"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/analysis/${session.id}?compare=true`}
                    className="flex h-8 items-center justify-center border border-border px-3 text-xs text-text hover:border-accent"
                  >
                    Compare
                  </Link>
                  <ConfirmDeleteButton
                    label={session.title}
                    consequence="Deletes this session and its video from this browser."
                    onConfirm={async () => {
                      await deleteStoredSession(session.id);
                      await library.reload();
                      setStorageVersion((current) => current + 1);
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
