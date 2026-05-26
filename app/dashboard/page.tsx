import { AppShell } from "@/components/app/app-shell";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default function DashboardRoute() {
  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  );
}
