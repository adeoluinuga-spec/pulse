"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Target, FileText, Star, Users } from "lucide-react";
import clsx from "clsx";

const TABS = [
  { id: "home",      label: "Home",      href: "/dashboard", Icon: Home     },
  { id: "goals",     label: "Goals",     href: "/goals",     Icon: Target   },
  { id: "reports",   label: "Reports",   href: "/reports",   Icon: FileText },
  { id: "appraisal", label: "Appraisal", href: "/appraisal", Icon: Star     },
  { id: "team",      label: "Team",      href: "/team",      Icon: Users    },
] as const;

function isActive(id: string, href: string, pathname: string): boolean {
  if (id === "home") return pathname.startsWith("/dashboard");
  return pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 bg-card/95 backdrop-blur-sm border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main navigation"
    >
      <div className="flex h-14">
        {TABS.map(({ id, label, href, Icon }) => {
          const active = isActive(id, href, pathname);
          return (
            <Link
              key={id}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px]",
                "transition-all duration-100 active:scale-95",
                active ? "text-pulse" : "text-muted hover:text-ink",
              )}
            >
              <Icon
                size={19}
                strokeWidth={active ? 2.5 : 1.75}
                className={clsx("transition-transform duration-150", active && "scale-110")}
              />
              <span
                className={clsx(
                  "text-[10px] tracking-wide",
                  active ? "font-bold" : "font-medium",
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
