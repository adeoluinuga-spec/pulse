"use client";

import clsx from "clsx";
import { X, Bell } from "lucide-react";
import { useUser } from "@/context/UserContext";
import type { NotificationType } from "@/types";
import EmptyState from "@/components/ui/EmptyState";

const ACCENT: Record<NotificationType, string> = {
  info:            "bg-muted",
  warning:         "bg-amber",
  success:         "bg-green",
  action_required: "bg-pulse",
  assessment_cycle_launched: "bg-cobalt",
  assessment_participant:    "bg-cobalt",
  assessment_reminder:       "bg-pulse",
};

const LABEL: Record<NotificationType, string | null> = {
  info:            null,
  warning:         null,
  success:         null,
  action_required: "Action",
  assessment_cycle_launched: "360",
  assessment_participant:    "360",
  assessment_reminder:       "Action",
};

function formatDate(dateStr: string): string {
  try {
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7)  return `${diff} days ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

export default function NotificationPanel() {
  const { notifications, notifOpen, closeNotif, hasUnread } = useUser();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Dimmer */}
      <div
        onClick={closeNotif}
        className={clsx(
          "fixed inset-0 z-[80] bg-black/40 transition-opacity duration-300",
          notifOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Panel */}
      <div
        className={clsx(
          "fixed top-0 right-0 bottom-0 z-[90] w-full max-w-[430px]",
          "bg-paper flex flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          notifOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-ink flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Bell size={15} className="text-white/65" />
            <h2
              className="text-sm font-semibold text-white"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="bg-pulse text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={closeNotif}
            aria-label="Close notifications"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:text-white transition-colors active:scale-95"
          >
            <X size={14} />
          </button>
        </div>

        {/* List / empty */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex h-full items-center px-5">
              <EmptyState icon="🔔" title="No new notifications" subtitle="You're up to date." />
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={clsx(
                  "flex items-stretch border-b border-border",
                  !n.read && "bg-pulse/[0.025]",
                )}
              >
                {/* Accent bar */}
                <div
                  className={clsx(
                    "w-[3px] flex-shrink-0 self-stretch",
                    !n.read ? "bg-pulse" : "bg-transparent",
                  )}
                />

                {/* Content */}
                <div className="flex items-start gap-3 px-4 py-4 flex-1 min-w-0">
                  {/* Status dot */}
                  <div className="mt-[5px] flex-shrink-0">
                    <span
                      className={clsx(
                        "block w-2 h-2 rounded-full",
                        !n.read ? ACCENT[n.type] : "bg-border",
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={clsx(
                        "text-sm leading-snug",
                        !n.read ? "font-semibold text-ink" : "font-medium text-ink/70",
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-muted/60 mt-1.5">{formatDate(n.date)}</p>
                  </div>

                  {/* Action badge */}
                  {!n.read && LABEL[n.type] && (
                    <span className="flex-shrink-0 self-start mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-pulse bg-pulse-soft px-2 py-0.5 rounded-full">
                      {LABEL[n.type]}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-card/60 flex-shrink-0">
          <p className="text-[11px] text-muted text-center">
            {hasUnread ? "Tap ✕ to mark all as read" : "All notifications read"}
          </p>
        </div>
      </div>
    </>
  );
}
