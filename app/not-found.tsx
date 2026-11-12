import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
        <h1 className="text-xl font-semibold text-text">This page or swing isn&rsquo;t here.</h1>
        <p className="mt-3 max-w-xl text-base text-text-muted">
          Swings are saved in the browser they were opened in, so a link from another device or
          browser won&rsquo;t find them.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/library"
            className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-bg"
          >
            Go to your library
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-control border border-border px-4 text-sm text-text hover:border-border-strong"
          >
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}
