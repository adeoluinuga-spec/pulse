"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart2,
  BriefcaseBusiness,
  Home,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

const roles = [
  { label: "Employee", path: "/dashboard/employee", icon: Home },
  { label: "Manager", path: "/dashboard/manager", icon: Users },
  { label: "HR", path: "/dashboard/hr", icon: ShieldCheck },
  { label: "Executive", path: "/dashboard/executive", icon: BarChart2 },
];

const quickLinks = [
  { label: "Goals", href: "/dashboard/employee", icon: Target },
  { label: "Reports", href: "/reports/submit", icon: BriefcaseBusiness },
];

export default function SidePanel() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-72 flex-col bg-ink text-white">
      <div className="flex h-full flex-col border-r border-white/10">
        <div className="px-7 pt-7 pb-6">
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              Pulse
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot" />
          </div>
          <p className="mt-2 text-xs leading-5 text-white/45">
            Performance intelligence for modern teams.
          </p>
        </div>

        <nav className="px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
            Workspaces
          </p>
          <div className="mt-3 space-y-1">
            {roles.map(({ label, path, icon: Icon }) => {
              const active = pathname === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-white text-ink shadow-sm"
                      : "text-white/58 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon
                    size={17}
                    className={active ? "text-pulse" : "text-white/40"}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-7 px-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
            Actions
          </p>
          <div className="mt-3 space-y-1">
            {quickLinks.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-white/55 transition-colors hover:bg-white/8 hover:text-white"
              >
                <Icon size={17} className="text-white/35" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-pulse">
                AI Active
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/55">
              Mock insights are live across reviews, OKRs, and appraisal
              recommendations.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/6 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3b5bdb] text-sm font-semibold">
              AO
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Zenith Corp</p>
              <p className="text-[11px] text-white/40">May 2026 cycle</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
