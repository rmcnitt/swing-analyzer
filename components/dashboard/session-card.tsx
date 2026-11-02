import Link from "next/link";
import { ArrowRight, Clock3, SplitSquareHorizontal } from "lucide-react";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface SessionCardProps {
  session: AnalysisSession;
  videos: VideoAsset[];
}

export function SessionCard({ session, videos }: SessionCardProps) {
  const primaryVideo = videos.find((video) => video.id === session.primaryVideoId);
  const secondaryVideo = videos.find((video) => video.id === session.secondaryVideoId);
  const href = session.secondaryVideoId
    ? `/compare/${session.id}`
    : `/analysis/${session.id}`;

  return (
    <article className="border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
            Saved session
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{session.title}</h3>
        </div>
        <span className="rounded-full border border-[color:var(--color-border)] bg-white/[0.03] px-3 py-1 text-xs text-[color:var(--color-muted)]">
          {session.syncEnabled ? "Synced" : "Independent"}
        </span>
      </div>

      <div className="space-y-3 text-sm text-[color:var(--color-muted)]">
        <p>{primaryVideo?.title ?? "Primary swing selected"}</p>
        {secondaryVideo ? (
          <p className="flex items-center gap-2">
            <SplitSquareHorizontal className="size-4" />
            Compared with {secondaryVideo.title}
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <Clock3 className="size-4" />
          Last opened {formatDate(session.lastOpenedAt)}
        </p>
      </div>

      <p className="mt-5 text-sm leading-7 text-slate-300">
        {session.notes}
      </p>

      <Link
        href={href}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-ink)]"
      >
        Open workspace
        <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}
