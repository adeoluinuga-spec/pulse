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
  { id: "assessments",  label: "360",         href: "/dashboard/360"            },
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

  const tabs = [
    ...BASE_TABS,
    TEAM_TAB,
    ...(["hr_admin", "super_admin"].includes(user.platformRole) ? [
      { id: "hr", label: "HR", href: "/dashboard/hr" },
      { id: "structure", label: "Org Structure", href: "/dashboard/organisation" },
    ] : []),
  ];

  return (
    <div className="sticky top-16 z-40 border-b border-ink/6 bg-cream/82 backdrop-blur-xl md:hidden">
      <div
        className="flex gap-1.5 overflow-x-auto px-4 py-2.5 scrollbar-none"
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
                "flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap",
                "transition-all duration-150 active:scale-95",
                active
                  ? "bg-ink text-white"
                  : "bg-card text-muted hover:text-ink",
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
