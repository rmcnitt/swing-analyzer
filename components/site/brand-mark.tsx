import Link from "next/link";
import { cn } from "@/lib/utils";

/** The one brand mark: an orange "SA" square, with the name beside it where there's room. */
export function BrandMark({ withName = false, className }: { withName?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("flex shrink-0 items-center gap-2.5", className)} aria-label="Swing Analyzer home">
      <span className="flex size-8 items-center justify-center bg-accent text-sm font-semibold text-bg">SA</span>
      {withName ? <span className="text-sm font-semibold text-text">Swing Analyzer</span> : null}
    </Link>
  );
}
