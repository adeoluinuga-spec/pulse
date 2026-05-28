"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useUser } from "@/context/UserContext";

type Tab = { id: string; label: string; href: string };

const BASE_TABS: Tab[] = [
  { id: "overview",     label: "Overview",    href: "/dashboard"                },
  { id: "profile",      label: "Profile",     href: "/dashboard/profile"        },
  { id: "performance",  label: "Performance", href: "/dashboard/performance"    },
  { id: "reports",      label: "Reports",     href: "/dashboard/reports"        },
  { id: "wellbeing",    label: "Wellbeing",   href: "/dashboard/ai-wellbeing"   },
];

const TEAM_TAB: Tab = { id: "team", label: "Team", href: "/dashboard/team" };

function tabIsActive(tab: Tab, pathname: string): boolean {
  if (tab.id === "overview") return pathname === "/dashboard";
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

export default function DashboardTabBar() {
  const pathname = usePathname();
  const { user } = useUser();

  const tabs = user.peopleResponsibility !== "none" ? [...BASE_TABS, TEAM_TAB] : BASE_TABS;

  return (
    <div className="sticky top-14 z-40 bg-ink/98 backdrop-blur-sm border-b border-white/8">
      <div
        className="flex gap-0.5 px-4 py-2.5 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {tabs.map((tab) => {
          const active = tabIsActive(tab, pathname);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={clsx(
                "flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap",
                "transition-all duration-150 active:scale-95",
                active
                  ? "bg-white/12 text-white font-semibold"
                  : "text-white/45 hover:text-white/70",
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
