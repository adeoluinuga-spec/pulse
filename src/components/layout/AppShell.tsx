"use client";

import { usePathname } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import WorkSidebar from "@/components/layout/WorkSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");
  const isImmersivePortal = pathname === "/hr" || pathname === "/executive";

  if (isAuth) {
    return <div className="min-h-screen bg-paper text-ink">{children}</div>;
  }

  if (isImmersivePortal) {
    return (
      <div className="min-h-screen bg-paper">
        <TopBar />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(232,68,10,0.08),transparent_32rem),linear-gradient(135deg,var(--cream),var(--paper))] text-ink">
      <WorkSidebar />
      <div className="min-h-screen md:pl-[280px]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col">
          <TopBar />
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
