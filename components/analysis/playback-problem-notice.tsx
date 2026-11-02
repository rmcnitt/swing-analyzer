import { TriangleAlert } from "lucide-react";
import { describePlaybackProblem, type PlaybackProblem } from "@/lib/video/playback-errors";
import { cn } from "@/lib/utils";

export function PlaybackProblemNotice({
  problem,
  fileName,
  mimeType,
  className,
  onDismiss,
}: {
  problem: PlaybackProblem;
  fileName?: string;
  mimeType?: string;
  className?: string;
  onDismiss?: () => void;
}) {
  const { title, detail } = describePlaybackProblem(problem, { fileName, mimeType });

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2.5 border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">
          {title}
          {fileName ? <span className="font-normal text-[color:var(--color-muted)]"> ({fileName})</span> : null}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">{detail}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="self-start text-xs text-[color:var(--color-muted)] hover:text-white"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
