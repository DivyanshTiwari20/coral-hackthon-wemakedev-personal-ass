"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, CalendarDays, MessageSquareText } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Chat", icon: MessageSquareText },
  { href: "/dashboard", label: "Dashboard", icon: CalendarDays },
  { href: "/assignments", label: "Assignments", icon: Blocks },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-900/80 bg-black/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">amaze</p>
          <h1 className="truncate text-base font-semibold text-zinc-50 sm:text-lg">
            Personal OS for study, work, and the messy middle
          </h1>
        </div>
        <nav className="flex w-full items-center gap-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-1 sm:w-auto sm:rounded-full">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition sm:rounded-full",
                  isActive
                    ? "bg-emerald-400 text-black"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
