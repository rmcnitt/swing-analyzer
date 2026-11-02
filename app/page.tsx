import { SwingHub } from "@/components/dashboard/swing-hub";
import { SiteHeader } from "@/components/site/site-header";
import { getAllVideos, getDashboardData } from "@/lib/data/repository";

export default async function Home() {
  const [dashboard, videos] = await Promise.all([getDashboardData(), getAllVideos()]);

  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader currentPath="/" />
      <SwingHub dashboard={dashboard} videos={videos} />
    </div>
  );
}
