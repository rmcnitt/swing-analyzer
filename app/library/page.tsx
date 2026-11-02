import { LibraryBrowser } from "@/components/library/library-browser";
import { SiteHeader } from "@/components/site/site-header";

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-[color:var(--color-background)]">
      <SiteHeader currentPath="/library" />
      <LibraryBrowser />
    </div>
  );
}
