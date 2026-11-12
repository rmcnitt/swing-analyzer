"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Lock, Play, UploadCloud, X } from "lucide-react";
import { HeroSwing } from "@/components/landing/hero-swing";
import {
  requestPersistentStorage,
  saveStoredSession,
  saveStoredVideo,
} from "@/lib/storage/session-storage";
import { useLocalLibrary } from "@/lib/storage/use-stored-videos";
import type { AnalysisSession, SwingOrientation, VideoAsset } from "@/lib/types";
import { createId, formatDuration } from "@/lib/utils";
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
  const importRef = useRef<HTMLDivElement | null>(null);
  const library = useLocalLibrary();
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

  const allSessions = library.sessions;

  // Bring the import setup into view once a file is picked.
  useEffect(() => {
    if (selectedFile) {
      importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedFile]);

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

  // The visitor's own sessions (not the bundled samples), newest first.
  const ownSessions = recentSessions.filter((session) => session.userId !== "sample");
  const latest = ownSessions[0];

  return (
    <main>
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 pt-8 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:px-6 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold tracking-tight text-text md:text-6xl md:tracking-[-0.02em]">
            Your swing, frame by frame.
          </h1>
          <p className="mt-5 text-base text-text-muted">
            Step through your swing, mark Address, Top and Impact, draw on any frame, and compare two
            swings side by side, matched at each position.
          </p>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/analysis/sample-session"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-bg"
            >
              <Play className="size-4" />
              Try the sample swing
            </Link>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-border px-4 text-sm text-text hover:border-border-strong"
            >
              <UploadCloud className="size-4" />
              Upload your swing
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

                event.target.value = "";
              }}
            />
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
            <Lock className="size-3.5" aria-hidden />
            Videos never leave your device.
          </p>

          {latest ? (
            <p className="mt-8 text-sm text-text-muted">
              Continue{" "}
              <Link href={`/analysis/${latest.id}`} className="text-text underline-offset-4 hover:underline">
                {latest.title}
              </Link>
              {ownSessions.length > 1 ? (
                <>
                  {" "}or see{" "}
                  <Link href="/library" className="text-text underline-offset-4 hover:underline">
                    all {ownSessions.length} swings
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <HeroSwing className="h-[min(78vh,640px)] min-h-[440px]" />
      </section>

      <div ref={importRef} className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 empty:hidden lg:px-6">
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
            <Link href="/library#references" className="text-accent underline">
              References
            </Link>
            . Load it into the compare pane from any session.
          </p>
        ) : null}

      </div>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-6 lg:py-16" aria-label="What it does">
        <div className="grid gap-8 md:grid-cols-3 md:gap-5">
          {FEATURES.map((feature) => (
            <figure key={feature.image}>
              <div className="overflow-hidden rounded-panel border border-border bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={feature.image}
                  alt={feature.alt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block aspect-[16/10] w-full object-cover object-top"
                />
              </div>
              <figcaption className="mt-3 text-sm text-text-muted">
                <span className="text-text">{feature.title}.</span> {feature.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-text-muted lg:px-6">
          <span>Swing Analyzer runs entirely in your browser.</span>
          <a
            href="https://github.com/rmcnitt/swing-analyzer"
            className="inline-flex items-center gap-1.5 hover:text-text"
          >
            Source on GitHub
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    image: "/landing/compare.jpg",
    title: "Compare by position",
    caption: "Two swings side by side, each jumping to its own Address, Top and Impact.",
    alt: "Two swings side by side, both paused at the top of the backswing",
  },
  {
    image: "/landing/checks.jpg",
    title: "Swing checks",
    caption: "Pose tracking measures tempo, head movement, posture and early extension.",
    alt: "A down-the-line swing with the pose skeleton and the swing checks panel",
  },
  {
    image: "/landing/drawing.jpg",
    title: "Draw on any frame",
    caption: "Lines, angles, swing planes and circles, exported with the frame as a PNG.",
    alt: "A swing frame with a swing plane line and a spine angle drawn on it",
  },
];
