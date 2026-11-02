import Link from "next/link";
import { Activity, LibraryBig, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  currentPath?: string;
}

const links = [
  {
    href: "/",
    label: "Hub",
    icon: MonitorPlay,
  },
  {
    href: "/library",
    label: "Library",
    icon: LibraryBig,
  },
];

export function SiteHeader({ currentPath }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--color-border)] bg-[#0d0e10]/95 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center bg-[color:var(--color-accent)] text-[color:var(--color-ink)]">
            <Activity className="size-4" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
              Swing Analyzer
            </p>
            <p className="text-sm font-semibold text-white">Study</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1.5 md:flex">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = currentPath === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex h-8 items-center gap-2 border px-2.5 text-xs transition",
                  isActive
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-white"
                    : "border-[color:var(--color-border)] bg-white/[0.03] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white",
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
