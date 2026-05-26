import type { ReactNode } from "react";

import { Navigation } from "@/components/app/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#050505_35%,#020202_100%)] text-zinc-100">
      <Navigation />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
