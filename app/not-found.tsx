import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-xs uppercase tracking-caps text-text-muted">
          Session not found
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-text">That swing workspace does not exist.</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-text-muted">
          It may have been created in another browser. Sessions are stored locally on this
          device. Import a swing from the hub to start a new one.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-bg"
        >
          Back to hub
        </Link>
      </main>
    </div>
  );
}
