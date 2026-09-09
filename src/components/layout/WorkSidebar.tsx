"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  GitBranch,
  Settings2,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { useUser } from "@/context/UserContext";

const primaryItems = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Profile", href: "/dashboard/profile", icon: BriefcaseBusiness },
  { label: "Performance", href: "/dashboard/performance", icon: BarChart3 },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "360 Assessments", href: "/assessments", icon: ClipboardList },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "AI & Wellbeing", href: "/dashboard/ai-wellbeing", icon: HeartPulse },
];

function active(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WorkSidebar() {
  return <Suspense><SidebarContent /></Suspense>;
}

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profileImages } = useUser();
  const profileImage = profileImages[user.id];
  const teamEnabled = user.peopleResponsibility !== "none";
  const assessmentHref = user.platformRole === "hr_admin" || user.platformRole === "super_admin"
    ? "/assessments"
    : "/dashboard/360";
  const portalItems = [
    ...(teamEnabled ? [{ label: "Team", href: "/dashboard/team", icon: Users }] : []),
    ...(user.platformRole === "hr_admin" || user.platformRole === "super_admin" ? [
      { label: "HR Dashboard", href: "/dashboard/hr", icon: ShieldCheck },
      { label: "Org Setup", href: "/dashboard/hr?mode=setup", icon: Settings2 },
      { label: "Org Structure", href: "/dashboard/organisation", icon: GitBranch },
    ] : []),
    ...(user.platformRole === "executive_view" || user.platformRole === "super_admin" ? [{ label: "Executive", href: "/executive", icon: Building2 }] : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-paper-200 bg-paper-50 text-ink md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-cobalt text-sm font-semibold text-white">P</span>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold text-ink">Pulse</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Work OS</p>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">Workspace</p>
        <div className="space-y-0.5">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const href = item.href === "/assessments" ? assessmentHref : item.href;
          const isActive = active(pathname, href);
          return (
            <Link
              key={item.href}
              href={href}
              className={clsx(
                "group flex min-h-9 items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                isActive ? "bg-cobalt-light font-semibold text-cobalt-dark" : "text-ink-500 hover:bg-paper-100 hover:text-ink",
              )}
            >
              <Icon size={16} className={isActive ? "text-cobalt" : "text-ink-300 group-hover:text-ink-500"} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
        </div>
      </nav>

      {portalItems.length > 0 && (
        <div className="border-t border-paper-200 px-3 py-4">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">Adaptive access</p>
          <div className="space-y-0.5">
            {portalItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/dashboard/hr?mode=setup"
                ? pathname === "/dashboard/hr" && searchParams.get("mode") === "setup"
                : item.href === "/dashboard/hr"
                  ? pathname === "/dashboard/hr" && searchParams.get("mode") !== "setup"
                  : active(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex min-h-9 items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive ? "bg-cobalt-light font-semibold text-cobalt-dark" : "text-ink-500 hover:bg-paper-100 hover:text-ink",
                  )}
                >
                  <Icon size={16} className={isActive ? "text-cobalt" : "text-ink-300"} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-paper-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-paper-100 text-xs font-semibold uppercase text-ink-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profileImage ? <img src={profileImage} alt="" className="h-full w-full object-cover" /> : user.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{user.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
