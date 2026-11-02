import { Film, Gauge, Upload } from "lucide-react";
import type { VideoAsset } from "@/lib/types";
import { formatDuration, formatDate } from "@/lib/utils";

interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  return (
    <article className="border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-white/[0.06] text-[color:var(--color-accent)]">
            <Film className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold text-white">{video.title}</h3>
            <p className="text-sm text-[color:var(--color-muted)]">{video.clubTag}</p>
          </div>
        </div>
        <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-muted)]">
          {video.orientation}
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-[color:var(--color-muted)] sm:grid-cols-3">
        <div className="bg-white/[0.035] p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Duration</p>
          <p className="mt-2 font-medium text-slate-100">{formatDuration(video.duration)}</p>
        </div>
        <div className="bg-white/[0.035] p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Frame Rate</p>
          <p className="mt-2 flex items-center gap-2 font-medium text-slate-100">
            <Gauge className="size-4 text-[color:var(--color-accent)]" />
            {video.fps ?? 60} fps
          </p>
        </div>
        <div className="bg-white/[0.035] p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Added</p>
          <p className="mt-2 flex items-center gap-2 font-medium text-slate-100">
            <Upload className="size-4 text-[color:var(--color-accent)]" />
            {formatDate(video.createdAt)}
          </p>
        </div>
      </div>
    </article>
  );
}
