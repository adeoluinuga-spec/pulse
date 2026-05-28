"use client";

import { Bell, BarChart2, ChevronRight, LogOut, Settings, Sparkles, User, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { dailyPulseLine } from "@/lib/pulseLanguage";

export default function TopBar() {
  const { user, signOut, openNotif, hasUnread, profileImages } = useUser();
  const pulseLine = dailyPulseLine();
  const profileImage = profileImages[user.id];
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function handle(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-50 flex min-h-16 flex-shrink-0 items-center justify-between border-b border-ink/6 bg-cream/88 px-4 pt-safe backdrop-blur-xl md:min-h-[76px] md:bg-cream/78 md:px-7">
      <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity active:opacity-70 md:hidden">
        <span className="h-2 w-2 flex-shrink-0 animate-pulse-dot rounded-full bg-pulse" />
        <span className="font-syne text-[17px] font-extrabold leading-none tracking-tight text-ink">Pulse</span>
      </Link>

      <div className="hidden min-w-0 md:block">
        <div className="flex items-center gap-2 text-pulse">
          <Sparkles size={14} />
          <p className="text-xs font-black uppercase tracking-[0.18em]">Living Work OS</p>
        </div>
        <p className="mt-1 truncate font-syne text-xl font-bold text-ink">
          {pulseLine}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={openNotif}
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted shadow-sm hover:text-ink active:scale-95"
        >
          <Bell size={17} strokeWidth={1.75} />
          {hasUnread && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-pulse" />}
        </button>

        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="Profile menu"
            className="ml-0.5 flex h-10 w-10 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white hover:ring-pulse/30 active:scale-95 md:h-11 md:w-11"
            style={{ backgroundColor: user.avatarColor }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profileImage ? <img src={profileImage} alt="" className="h-full w-full rounded-full object-cover" /> : user.initials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] z-[60] w-72 overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-lg)] animate-fade-up">
              <div className="border-b border-border bg-paper/70 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: user.avatarColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {profileImage ? <img src={profileImage} alt="" className="h-full w-full object-cover" /> : user.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{user.name}</p>
                    <p className="truncate text-[11px] text-muted">{user.role}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted/70">{user.cadre} / {user.peopleResponsibility}</p>
                  </div>
                </div>
              </div>

              <div className="py-1.5">
                <DropItem href="/dashboard/profile" Icon={User} label="My Profile" onClick={() => setProfileOpen(false)} />
                <DropItem href="/dashboard/performance" Icon={BarChart2} label="Performance" onClick={() => setProfileOpen(false)} />
                <DropItem href="/settings" Icon={Settings} label="Settings" onClick={() => setProfileOpen(false)} />

                {(user.platformRole === "hr_admin" || user.platformRole === "super_admin") && (
                  <DropItem href="/hr" Icon={Users} label="Switch to HR View" accent onClick={() => setProfileOpen(false)} />
                )}

                {(user.platformRole === "executive_view" || user.platformRole === "super_admin") && (
                  <DropItem href="/executive" Icon={BarChart2} label="Switch to Executive View" accent onClick={() => setProfileOpen(false)} />
                )}
              </div>

              <div className="border-t border-border py-1.5">
                <button
                  onClick={() => { setProfileOpen(false); void signOut(); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red transition-colors hover:bg-red-soft/30 active:scale-[0.98]"
                >
                  <LogOut size={14} className="text-red" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropItem({
  href,
  Icon,
  label,
  accent = false,
  onClick,
}: {
  href: string;
  Icon: React.ElementType;
  label: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-paper active:scale-[0.98]">
      <Icon size={14} className={accent ? "text-pulse" : "text-muted"} />
      <span className={accent ? "font-semibold text-pulse" : "text-ink"}>{label}</span>
      <ChevronRight size={11} className="ml-auto text-muted/30" />
    </Link>
  );
}
