"use client";

import { Bell } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { useNotifications } from "@/context/NotificationContext";
import { useUser } from "@/context/UserContext";

export default function TopBar() {
  const { config } = useRole();
  const { hasUnread, open } = useNotifications();
  const { orgName } = useUser();

  return (
    <div className="h-14 bg-ink md:bg-card md:border-b md:border-border flex items-center justify-between px-4 md:px-6 shadow-sm md:shadow-none">
      {/* Left — wordmark */}
      <div className="flex items-center gap-2">
        <span
          className="text-white text-xl font-semibold tracking-tight md:hidden"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Pulse
        </span>
        <span
          className="hidden text-xl font-semibold tracking-tight text-ink md:inline"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Command Center
        </span>
        <span className="hidden md:inline-flex rounded-full border border-pulse/20 bg-pulse-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-pulse">
          Live Mock
        </span>
        <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot md:hidden" />
      </div>

      {/* Right — bell + org label + avatar */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button
          onClick={open}
          aria-label="Open notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white md:text-muted md:hover:text-ink transition-colors"
        >
          <Bell size={18} />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-pulse border-2 border-ink md:border-card" />
          )}
        </button>

        <div className="text-right hidden sm:block">
          <p className="text-white md:text-ink text-xs font-medium leading-none">{orgName || "Pulse"}</p>
          <p className="text-white/65 md:text-muted text-[10px] mt-0.5">May 2026 cycle</p>
        </div>

        {/* Role avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white/10 md:ring-border transition-colors duration-300"
          style={{ backgroundColor: config.color }}
        >
          {config.initials}
        </div>
      </div>
    </div>
  );
}
