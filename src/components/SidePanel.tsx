"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart2, BriefcaseBusiness, Home, ShieldCheck,
  Sparkles, Target, Users, Star,
} from "lucide-react";
import { useRole, ROLES, ROLE_LIST } from "@/context/RoleContext";

const quickLinks = [
  { label: "Goals",      href: "/goals",           icon: Target          },
  { label: "Reports",    href: "/reports",          icon: BriefcaseBusiness },
  { label: "Appraisal",  href: "/appraisal",        icon: Star            },
  { label: "Team",       href: "/team",             icon: Users           },
];

const roleIcons: Record<string, React.ElementType> = {
  employee:  Home,
  manager:   Users,
  hr:        ShieldCheck,
  executive: BarChart2,
};

export default function SidePanel() {
  const pathname = usePathname();
  const { config } = useRole();

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-72 flex-col bg-ink text-white">
      <div className="flex h-full flex-col border-r border-white/10">

        {/* Logo */}
        <div className="px-7 pt-7 pb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
              Pulse
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot" />
          </div>
          <p className="mt-2 text-xs leading-5 text-white/45">
            Performance intelligence for modern teams.
          </p>
        </div>

        {/* Workspaces */}
        <nav className="px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
            Workspaces
          </p>
          <div className="mt-3 space-y-1">
            {ROLE_LIST.map((r) => {
              const Icon   = roleIcons[r.key] ?? Home;
              const active = pathname === r.path;
              return (
                <Link
                  key={r.key}
                  href={r.path}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-150",
                    active
                      ? "bg-white text-ink shadow-sm"
                      : "text-white/55 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon size={17} className={active ? "text-pulse" : "text-white/40"} />
                  {r.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Quick links */}
        <div className="mt-7 px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
            Navigate
          </p>
          <div className="mt-3 space-y-1">
            {quickLinks.map(({ label, href, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={label}
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors",
                    active
                      ? "text-white bg-white/8"
                      : "text-white/55 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon size={17} className={active ? "text-pulse" : "text-white/35"} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto p-4 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-pulse">
                AI Active
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/55">
              Mock insights are live across reviews, OKRs, and appraisal recommendations.
            </p>
          </div>

          {/* Role-aware user chip */}
          <div className="flex items-center gap-3 rounded-xl bg-white/6 p-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300"
              style={{ backgroundColor: config.color }}
            >
              {config.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Zenith Corp</p>
              <p className="text-[11px] text-white/40">{config.label} view</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
