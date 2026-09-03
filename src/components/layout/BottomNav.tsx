"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, Target, FileText, Star, Users } from "lucide-react";
import clsx from "clsx";
import { useUser } from "@/context/UserContext";

const TABS = [
  { id: "home",      label: "Home",      href: "/dashboard", Icon: Home     },
  { id: "goals",     label: "Goals",     href: "/goals",     Icon: Target   },
  { id: "assessments", label: "360",     href: "/assessments", Icon: ClipboardList },
  { id: "reports",   label: "Reports",   href: "/dashboard/reports", Icon: FileText },
  { id: "appraisal", label: "Appraisal", href: "/appraisal", Icon: Star     },
  { id: "team",      label: "Team",      href: "/dashboard/team", Icon: Users    },
] as const;

function isActive(id: string, href: string, pathname: string): boolean {
  if (id === "home") return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const tabs = user.peopleResponsibility === "none" ? TABS.filter((tab) => tab.id !== "team") : TABS;

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 12px)" }}
      aria-label="Main navigation"
    >
      <div className="border-t border-paper-200 bg-surface/96 backdrop-blur-md">
        <div className="flex h-[54px]">
          {tabs.map(({ id, label, href, Icon }) => {
            const active = isActive(id, href, pathname);
            return (
              <Link
                key={id}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex-1 flex flex-col items-center justify-center gap-[3px] min-h-[44px]",
                  "transition-all duration-150 active:scale-90",
                )}
              >
                <div className="relative">
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={clsx(
                      "transition-all duration-150",
                    active ? "text-cobalt scale-110" : "text-muted",
                    )}
                  />
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cobalt" />
                  )}
                </div>
                <span
                  className={clsx(
                    "text-[9.5px] tracking-wide transition-all duration-150",
                    active ? "font-semibold text-cobalt" : "font-medium text-muted",
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
