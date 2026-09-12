"use client";

import { usePathname } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import WorkSidebar from "@/components/layout/WorkSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");
  const isStandalone =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/review") ||
    pathname === "/admin";
  const isImmersivePortal = pathname === "/hr" || pathname === "/executive";

  if (isAuth || isStandalone) {
    return <div className="pulse-standalone min-h-screen bg-background text-foreground">{children}</div>;
  }

  if (isImmersivePortal) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <WorkSidebar />
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <TopBar />
        <div className="pulse-content min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
