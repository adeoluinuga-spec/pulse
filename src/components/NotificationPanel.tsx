"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

export default function NotificationPanel() {
  const { notifications, isOpen, hasUnread, close } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        className={clsx(
          "fixed inset-0 z-[80] bg-black/40 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Panel — slides in from the right */}
      <div
        className={clsx(
          "fixed top-0 right-0 bottom-0 z-[90] w-full sm:max-w-sm bg-paper flex flex-col",
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2
              className="text-base font-bold text-ink"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="bg-pulse text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-border text-muted hover:text-ink transition-colors"
            aria-label="Close notifications"
          >
            <X size={14} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={clsx(
                "flex items-stretch border-b border-border transition-colors",
                !n.read && "bg-pulse/[0.02]"
              )}
            >
              {/* Left accent bar */}
              <div
                className={clsx(
                  "w-[3px] flex-shrink-0",
                  !n.read ? "bg-pulse" : "bg-transparent"
                )}
              />

              {/* Content */}
              <div className="flex items-start gap-3 px-4 py-4 flex-1 min-w-0">
                {/* Unread dot */}
                <div className="mt-1.5 flex-shrink-0 w-2">
                  {!n.read && (
                    <span className="block w-2 h-2 rounded-full bg-pulse" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={clsx(
                      "text-sm leading-tight",
                      !n.read ? "font-semibold text-ink" : "font-medium text-ink"
                    )}
                  >
                    {n.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    {n.body}
                  </p>
                  <p className="text-[10px] text-muted/60 mt-1.5">{n.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <p className="text-[11px] text-muted text-center">
            {hasUnread ? "Closing will mark all as read" : "All caught up"}
          </p>
        </div>
      </div>
    </>
  );
}
