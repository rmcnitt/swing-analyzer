import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader />
      <main className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-muted)]">
          Session not found
        </p>
        <h1 className="mt-4 text-5xl font-semibold text-white">That swing workspace does not exist.</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
          Try the seeded demo sessions from the dashboard, or create a new study
          flow from the landing page.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-[color:var(--color-accent)] px-5 py-3 text-sm font-semibold text-[color:var(--color-ink)]"
        >
          Back to hub
        </Link>
      </main>
    </div>
  );
}
