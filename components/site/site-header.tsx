import Link from "next/link";
import { House, LibraryBig } from "lucide-react";
import { BrandMark } from "@/components/site/brand-mark";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  currentPath?: string;
}

const links = [
  {
    href: "/",
    label: "Home",
    icon: House,
  },
  {
    href: "/library",
    label: "Library",
    icon: LibraryBig,
  },
];

export function SiteHeader({ currentPath }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-1">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
        <BrandMark withName />

        <nav className="flex items-center gap-1.5">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = currentPath === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex h-8 items-center gap-2 border px-2.5 text-xs transition pointer-coarse:h-10 pointer-coarse:px-3",
                  isActive
                    ? "border-accent bg-accent-dim text-text"
                    : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text",
                )}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
