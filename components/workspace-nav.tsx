"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/app", "Overview"],
  ["/app/jobs", "Job finder"],
  ["/app/market", "Market"],
  ["/app/resume", "Resume audit"],
  ["/app/linkedin", "LinkedIn"],
  ["/app/kits", "Application kits"],
  ["/app/portfolio", "Portfolio"],
  ["/app/tracker", "Tracker"],
  ["/app/settings", "Settings"],
];

export function WorkspaceNav() {
  const path = usePathname();
  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map(([href, label]) => {
        const active = href === "/app" ? path === "/app" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm ${active ? "bg-sheet font-bold text-ink shadow-[inset_3px_0_0_var(--pen)]" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
