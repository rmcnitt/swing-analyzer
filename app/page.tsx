import { SwingHub } from "@/components/dashboard/swing-hub";
import { SiteHeader } from "@/components/site/site-header";

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader currentPath="/" />
      <SwingHub />
    </div>
  );
}
