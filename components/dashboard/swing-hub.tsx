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
  initializeLocalLibrary,
  loadStoredSessions,
  loadStoredVideos,
  saveStoredSession,
  saveStoredVideo,
} from "@/lib/storage/session-storage";
import type {
  AnalysisSession,
  DashboardData,
  SwingOrientation,
  VideoAsset,
} from "@/lib/types";
import { createId, formatDate, formatDuration } from "@/lib/utils";

interface SwingHubProps {
  dashboard: DashboardData;
  videos: VideoAsset[];
}

interface ImportMetadata {
  duration: number;
  width: number;
  height: number;
}

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

export function SwingHub({ dashboard, videos }: SwingHubProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [storedSessions, setStoredSessions] = useState<AnalysisSession[]>([]);
  const [storedVideos, setStoredVideos] = useState<VideoAsset[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ImportMetadata | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [club, setClub] = useState("7 Iron");
  const [orientation, setOrientation] = useState<SwingOrientation>("face-on");
  const [notes, setNotes] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    void initializeLocalLibrary({
      sessions: dashboard.sessions,
      videos,
    }).then(async () => {
      const [nextSessions, nextVideos] = await Promise.all([
        loadStoredSessions(),
        loadStoredVideos(),
      ]);

      setStoredSessions(nextSessions);
      setStoredVideos(nextVideos);
    });
  }, [dashboard.sessions, videos]);

  const allVideos = useMemo(() => uniqueVideos([...storedVideos, ...videos]), [storedVideos, videos]);
  const allSessions = useMemo(
    () => uniqueSessions([...storedSessions, ...dashboard.sessions]),
    [dashboard.sessions, storedSessions],
  );

  const videoById = useMemo(
    () => new Map(allVideos.map((video) => [video.id, video])),
    [allVideos],
  );

  const recentSessions = [...allSessions].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  );

  const handleSelectFile = async (file: File) => {
    const nextPreviewUrl = URL.createObjectURL(file);
    const nextMetadata = await readVideoMetadata(nextPreviewUrl);
    const baseName = file.name.replace(/\.[^.]+$/, "");

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setMetadata(nextMetadata);
    setSessionName(baseName || "Range swing");
  };

  const handleCancelImport = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setMetadata(null);
    setSessionName("");
    setNotes("");
  };

  const handleCreateSession = async () => {
    if (!selectedFile || !previewUrl || !metadata || isImporting) {
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
      ownerName: "Local library",
      sourceType: "local",
      duration: metadata.duration,
      fps: 120,
      width: metadata.width,
      height: metadata.height,
      orientation,
      clubTag: club,
      uploadStatus: "ready",
      createdAt: now,
    };
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

    const thumbnail = await createVideoThumbnail(previewUrl);

    await saveStoredVideo(video, selectedFile, thumbnail);
    await saveStoredSession(session);
    router.push(`/analysis/${sessionId}`);
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-6">
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-[color:var(--color-border)] bg-[#0f1012] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
                Swing library
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white">Recent swings</h1>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 bg-[color:var(--color-accent)] px-3 text-sm font-semibold text-[color:var(--color-ink)]"
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

        <div className="border border-[color:var(--color-border)] bg-[#0f1012] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
            Quick actions
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={`/analysis/${recentSessions[0]?.id ?? "session-iron-baseline"}`}
              className="flex h-9 items-center justify-center gap-2 border border-[color:var(--color-border)] text-xs text-white hover:border-[color:var(--color-accent)]"
            >
              <FolderOpen className="size-4" />
              Open latest
            </Link>
            <Link
              href={`/analysis/${recentSessions[0]?.id ?? "session-iron-baseline"}?compare=true`}
              className="flex h-9 items-center justify-center gap-2 border border-[color:var(--color-border)] text-xs text-white hover:border-[color:var(--color-accent)]"
            >
              <Columns2 className="size-4" />
              Compare
            </Link>
          </div>
        </div>
      </section>

      {selectedFile ? (
        <section className="grid gap-3 border border-[color:var(--color-accent)] bg-[#111214] p-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="overflow-hidden bg-black">
            {previewUrl ? (
              <video src={previewUrl} className="aspect-video w-full object-contain" muted playsInline />
            ) : null}
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
                  Import setup
                </p>
                <h2 className="mt-1 text-base font-semibold text-white">{selectedFile.name}</h2>
                <p className="mt-1 text-sm text-[color:var(--color-muted)]">
                  {metadata ? formatDuration(metadata.duration) : "Reading video"} / local browser library
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelImport}
                className="flex size-8 items-center justify-center border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-white"
                aria-label="Cancel import"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-[color:var(--color-muted)]">Session name</span>
                <input
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  className="mt-1 h-9 w-full border border-[color:var(--color-border)] bg-black/35 px-2.5 text-sm text-white outline-none focus:border-[color:var(--color-accent)]"
                />
              </label>

              <label className="block">
                <span className="text-xs text-[color:var(--color-muted)]">Club</span>
                <select
                  value={club}
                  onChange={(event) => setClub(event.target.value)}
                  className="mt-1 h-9 w-full border border-[color:var(--color-border)] bg-black/35 px-2.5 text-sm text-white outline-none focus:border-[color:var(--color-accent)]"
                >
                  {clubOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="text-xs text-[color:var(--color-muted)]">View angle</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["face-on", "down-the-line"] as SwingOrientation[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOrientation(option)}
                      className={`h-9 border px-3 text-sm ${
                        orientation === option
                          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/14 text-white"
                          : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
                      }`}
                    >
                      {option === "face-on" ? "Face-on" : "Down-the-line"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="text-xs text-[color:var(--color-muted)]">Notes / tags</span>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Tempo, takeaway, impact..."
                  className="mt-1 h-9 w-full border border-[color:var(--color-border)] bg-black/35 px-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[color:var(--color-accent)]"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isImporting}
                className="inline-flex h-9 items-center gap-2 bg-[color:var(--color-accent)] px-3 text-sm font-semibold text-[color:var(--color-ink)] disabled:opacity-60"
              >
                <Play className="size-4" />
                Open analysis
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border border-[color:var(--color-border)] bg-[#0f1012]">
        <div className="grid grid-cols-[minmax(0,1fr)_110px_100px_130px] border-b border-[color:var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)] max-lg:hidden">
          <span>Swing</span>
          <span>Club</span>
          <span>View</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-[color:var(--color-border)]">
          {recentSessions.map((session) => {
            const video = videoById.get(session.primaryVideoId);

            return (
              <article
                key={session.id}
                className="grid gap-3 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_100px_130px] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden bg-black text-[color:var(--color-accent)]">
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
                    <h2 className="truncate text-sm font-semibold text-white">{session.title}</h2>
                    <p className="mt-1 truncate text-xs text-[color:var(--color-muted)]">
                      {formatDate(session.lastOpenedAt)} / {video ? formatDuration(video.duration) : "0:00"} /{" "}
                      {session.snapshotMarkers.length} markers
                    </p>
                  </div>
                </div>

                <p className="text-sm text-[color:var(--color-muted)]">{video?.clubTag ?? "Swing"}</p>
                <p className="text-sm text-[color:var(--color-muted)]">
                  {video?.orientation === "down-the-line" ? "DTL" : "Face-on"}
                </p>
                <div className="flex justify-start gap-2 lg:justify-end">
                  <Link
                    href={`/analysis/${session.id}`}
                    className="flex h-8 items-center justify-center border border-[color:var(--color-border)] px-3 text-xs text-white hover:border-[color:var(--color-accent)]"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/analysis/${session.id}?compare=true`}
                    className="flex h-8 items-center justify-center border border-[color:var(--color-border)] px-3 text-xs text-white hover:border-[color:var(--color-accent)]"
                  >
                    Compare
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
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

function readVideoMetadata(url: string) {
  return new Promise<ImportMetadata>((resolve) => {
    const element = document.createElement("video");

    element.preload = "metadata";
    element.src = url;

    element.onloadedmetadata = () => {
      resolve({
        duration: element.duration || 0,
        width: element.videoWidth || 0,
        height: element.videoHeight || 0,
      });
    };

    element.onerror = () => {
      resolve({
        duration: 0,
        width: 0,
        height: 0,
      });
    };
  });
}

function createVideoThumbnail(url: string) {
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    const capture = () => {
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.round((canvas.width / width) * height);

      const context = canvas.getContext("2d");

      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.72);
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = capture;
    video.onerror = () => resolve(null);
  });
}
