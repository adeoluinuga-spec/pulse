"use client";

import { Bell, User, Settings, LogOut, Users, BarChart2, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function TopBar() {
  const { user, setActiveUser, openNotif, hasUnread } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-50 min-h-14 bg-ink flex items-center justify-between px-4 pt-safe flex-shrink-0">
      {/* Left — animated dot + wordmark */}
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot" />
        <span
          className="text-white text-lg font-extrabold tracking-tight leading-none"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Pulse
        </span>
      </div>

      {/* Right — bell + avatar */}
      <div className="flex items-center gap-1.5">
        {/* Bell */}
        <button
          onClick={openNotif}
          aria-label="Notifications"
          className="relative w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white active:scale-95 transition-all"
        >
          <Bell size={18} />
          {hasUnread && (
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-pulse" />
          )}
        </button>

        {/* Avatar */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setProfileOpen((p) => !p)}
            aria-label="Profile menu"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-white/15 active:scale-95 transition-transform"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.initials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-card rounded-2xl shadow-[var(--shadow-lg)] border border-border z-[60] overflow-hidden animate-fade-up">
              {/* Identity */}
              <div className="px-4 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: user.avatarColor }}
                  >
                    {user.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{user.name}</p>
                    <p className="text-[11px] text-muted truncate">{user.role}</p>
                    <p className="text-[10px] text-muted/60 truncate">{user.department}</p>
                  </div>
                </div>
              </div>

              {/* Nav links */}
              <div className="py-1">
                <DropItem href="/profile" Icon={User} label="My Profile" onClick={() => setProfileOpen(false)} />
                <DropItem href="/settings" Icon={Settings} label="Settings" onClick={() => setProfileOpen(false)} />

                {(user.platformRole === "hr_admin" || user.platformRole === "super_admin") && (
                  <DropItem
                    href="/hr"
                    Icon={Users}
                    label="Switch to HR View"
                    accent
                    onClick={() => setProfileOpen(false)}
                  />
                )}

                {(user.platformRole === "executive_view" || user.platformRole === "super_admin") && (
                  <DropItem
                    href="/executive"
                    Icon={BarChart2}
                    label="Switch to Executive View"
                    accent
                    onClick={() => setProfileOpen(false)}
                  />
                )}
              </div>

              {/* Sign out */}
              <div className="border-t border-border py-1">
                <button
                  onClick={() => { setActiveUser("e01"); setProfileOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red hover:bg-red-soft/40 transition-colors active:scale-[0.98]"
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
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper transition-colors active:scale-[0.98]"
    >
      <Icon size={14} className={accent ? "text-pulse" : "text-muted"} />
      <span className={accent ? "text-pulse font-semibold" : "text-ink"}>{label}</span>
      <ChevronRight size={12} className="ml-auto text-muted/40" />
    </Link>
  );
}
