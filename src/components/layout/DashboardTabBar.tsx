"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useUser } from "@/context/UserContext";

type Tab = { id: string; label: string; href: string };

const BASE_TABS: Tab[] = [
  { id: "profile",      label: "Profile",        href: "/dashboard/profile"      },
  { id: "performance",  label: "Performance",    href: "/dashboard/performance"  },
  { id: "reports",      label: "Reports",        href: "/dashboard/reports"      },
  { id: "ai-wellbeing", label: "AI & Wellbeing", href: "/dashboard/ai-wellbeing" },
];

const TEAM_TAB: Tab = { id: "team", label: "Team", href: "/dashboard/team" };

export default function DashboardTabBar() {
  const pathname = usePathname();
  const { user } = useUser();

  const tabs =
    user.peopleResponsibility !== "none" ? [...BASE_TABS, TEAM_TAB] : BASE_TABS;

  return (
    <div className="sticky top-14 z-40 bg-ink/95 backdrop-blur-sm border-b border-white/8">
      <div
        className="flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={clsx(
                "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap",
                "transition-all duration-150 active:scale-95",
                active
                  ? "bg-pulse text-white shadow-sm"
                  : "text-white/50 border border-white/10 hover:text-white/80 hover:border-white/20",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
