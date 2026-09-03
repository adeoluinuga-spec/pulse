"use client";

import { Bell, BarChart2, ChevronRight, LogOut, Settings, User, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function TopBar() {
  const { user, signOut, openNotif, hasUnread, profileImages } = useUser();
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
    <header className="sticky top-0 z-50 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-paper-200 bg-surface/90 px-4 pt-safe backdrop-blur-xl sm:px-6 lg:px-8">
      <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity active:opacity-70 md:hidden">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-cobalt text-xs font-semibold text-white">P</span>
        <span className="font-display text-[15px] font-semibold text-ink">Pulse</span>
      </Link>

      <div className="hidden min-w-0 md:block">
        <h1 className="font-display text-lg font-semibold text-ink">Performance command center</h1>
        <p className="mt-0.5 text-xs text-muted">Pulse Work OS</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={openNotif}
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-paper-200 bg-surface text-muted shadow-sm transition-colors hover:bg-paper-50 hover:text-ink active:scale-95"
        >
          <Bell size={17} strokeWidth={1.75} />
          {hasUnread && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-pulse" />}
        </button>

        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="Profile menu"
            className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-paper-100 text-[11px] font-semibold uppercase text-ink-600 ring-1 ring-paper-200 active:scale-95"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profileImage ? <img src={profileImage} alt="" className="h-full w-full rounded-full object-cover" /> : user.initials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] z-[60] w-72 overflow-hidden rounded-lg border border-paper-200 bg-surface shadow-[var(--shadow-lg)] animate-fade-up">
              <div className="border-b border-paper-200 bg-paper-50 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-100 text-[11px] font-semibold uppercase text-ink-600">
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
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red transition-colors hover:bg-red-soft active:scale-[0.98]"
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
    <Link href={href} onClick={onClick} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-paper-50 active:scale-[0.98]">
      <Icon size={14} className={accent ? "text-pulse" : "text-muted"} />
      <span className={accent ? "font-semibold text-pulse" : "text-ink"}>{label}</span>
      <ChevronRight size={11} className="ml-auto text-muted/30" />
    </Link>
  );
}
