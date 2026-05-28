"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  FileText,
  HeartPulse,
  Home,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { dailyPulseLine } from "@/lib/pulseLanguage";

const primaryItems = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Profile", href: "/dashboard/profile", icon: BriefcaseBusiness },
  { label: "Performance", href: "/dashboard/performance", icon: BarChart3 },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "AI & Wellbeing", href: "/dashboard/ai-wellbeing", icon: HeartPulse },
];

function active(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WorkSidebar() {
  const pathname = usePathname();
  const { user, profileImages } = useUser();
  const pulseLine = dailyPulseLine();
  const profileImage = profileImages[user.id];
  const teamEnabled = user.peopleResponsibility !== "none";
  const portalItems = [
    ...(teamEnabled ? [{ label: "Team", href: "/dashboard/team", icon: Users }] : []),
    ...(user.platformRole === "hr_admin" || user.platformRole === "super_admin" ? [{ label: "HR View", href: "/hr", icon: ShieldCheck }] : []),
    ...(user.platformRole === "executive_view" || user.platformRole === "super_admin" ? [{ label: "Executive", href: "/executive", icon: Building2 }] : []),
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-ink/8 bg-ink px-4 py-5 text-white md:flex md:flex-col">
      <Link href="/dashboard" className="flex min-h-11 items-center gap-3 rounded-2xl px-2">
        <span className="relative grid h-9 w-9 place-items-center rounded-2xl bg-pulse text-sm font-black shadow-[0_0_0_6px_rgba(232,68,10,0.12)]">P</span>
        <div>
          <p className="font-syne text-lg font-extrabold leading-none">Pulse</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Work OS</p>
        </div>
      </Link>

      <div className="mt-6 rounded-[20px] border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-pulse">
          <Sparkles size={14} />
          <p className="text-xs font-bold">Pulse noticed</p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/72">
          {pulseLine}
        </p>
      </div>

      <nav className="mt-6 space-y-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = active(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition",
                isActive ? "bg-white text-ink shadow-[0_8px_30px_rgba(0,0,0,0.16)]" : "text-white/56 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon size={17} className={isActive ? "text-pulse" : "text-white/38 group-hover:text-pulse"} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {portalItems.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/28">Adaptive access</p>
          <div className="mt-2 space-y-1">
            {portalItems.map((item) => {
              const Icon = item.icon;
              const isActive = active(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition",
                    isActive ? "bg-pulse text-white" : "text-white/56 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto rounded-[22px] border border-white/10 bg-paper p-4 text-ink">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full text-xs font-black text-white ring-2 ring-white" style={{ backgroundColor: user.avatarColor }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profileImage ? <img src={profileImage} alt="" className="h-full w-full object-cover" /> : user.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.role}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-pulse-soft px-2 py-1 text-[10px] font-bold text-pulse">{user.cadre}</span>
          <span className="rounded-full bg-green-soft px-2 py-1 text-[10px] font-bold text-green">{user.peopleResponsibility}</span>
        </div>
      </div>
    </aside>
  );
}
