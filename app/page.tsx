import { SwingHub } from "@/components/dashboard/swing-hub";
import { SiteHeader } from "@/components/site/site-header";
import { sampleSessions, sampleVideos } from "@/lib/data/seed";

export default function Home() {
  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader currentPath="/" />
      <SwingHub sessions={sampleSessions} videos={sampleVideos} />
    </div>
  );
}
