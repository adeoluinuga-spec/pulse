"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Target, BarChart2, Star, Users } from "lucide-react";
import clsx from "clsx";

const navItems = [
  { label: "Home", icon: Home, href: "/dashboard/employee" },
  { label: "Goals", icon: Target, href: "/dashboard/employee" },
  { label: "Reports", icon: BarChart2, href: "/dashboard/hr" },
  { label: "Appraisal", icon: Star, href: "/dashboard/executive" },
  { label: "Team", icon: Users, href: "/dashboard/manager" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom">
      <div className="flex h-20 max-w-screen-sm mx-auto pb-1">
        {navItems.map(({ label, icon: Icon, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-150",
                isActive ? "text-pulse" : "text-muted hover:text-ink"
              )}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 1.75}
              />
              <span
                className={clsx(
                  "text-[10px] tracking-wide",
                  isActive ? "font-semibold" : "font-medium"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
