"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Target, BarChart2, Star, Users } from "lucide-react";
import clsx from "clsx";
import { useRole, ROLES, type RoleKey } from "@/context/RoleContext";

type TabId = "home" | "goals" | "reports" | "appraisal" | "team";

const tabs: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "home",     label: "Home",     Icon: Home     },
  { id: "goals",    label: "Goals",    Icon: Target   },
  { id: "reports",  label: "Reports",  Icon: BarChart2 },
  { id: "appraisal",label: "Appraisal",Icon: Star     },
  { id: "team",     label: "Team",     Icon: Users    },
];

function getHref(id: TabId, role: RoleKey): string {
  if (id === "home") return ROLES[role].path;
  return `/${id}`;
}

function isTabActive(id: TabId, pathname: string): boolean {
  if (id === "home") {
    // Active on any dashboard path
    return Object.values(ROLES).some((r) => pathname === r.path);
  }
  return pathname.startsWith(`/${id}`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const { role } = useRole();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
      <div className="flex h-20 max-w-screen-sm mx-auto pb-safe">
        {tabs.map(({ id, label, Icon }) => {
          const active = isTabActive(id, pathname);
          const href   = getHref(id, role);

          return (
            <Link
              key={id}
              href={href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-150",
                active ? "text-pulse" : "text-muted hover:text-ink"
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.75}
                className={clsx(
                  "transition-transform duration-150",
                  active && "scale-110"
                )}
              />
              <span
                className={clsx(
                  "text-[10px] tracking-wide",
                  active ? "font-semibold" : "font-medium"
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
