import { LibraryBrowser } from "@/components/library/library-browser";
import { SiteHeader } from "@/components/site/site-header";
import { getAllVideos, getDashboardData, getProSwings } from "@/lib/data/repository";

export default async function LibraryPage() {
  const [dashboard, videos, proSwings] = await Promise.all([
    getDashboardData(),
    getAllVideos(),
    getProSwings(),
  ]);

  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader currentPath="/library" />
      <LibraryBrowser
        sessions={dashboard.sessions}
        videos={videos}
        proSwings={proSwings}
      />
    </div>
  );
}
