import { LibraryBrowser } from "@/components/library/library-browser";
import { SiteHeader } from "@/components/site/site-header";
import { sampleSessions, sampleVideos } from "@/lib/data/seed";

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader currentPath="/library" />
      <LibraryBrowser
        sessions={sampleSessions}
        videos={sampleVideos}
      />
    </div>
  );
}
