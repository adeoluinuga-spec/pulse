"use client";

import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from "react";
import { notifications as seed, type AppNotification } from "@/data/mockData";

interface NotifContextValue {
  notifications: AppNotification[];
  isOpen: boolean;
  hasUnread: boolean;
  open: () => void;
  close: () => void;
}

const NotifContext = createContext<NotifContextValue>({
  notifications: [],
  isOpen: false,
  hasUnread: false,
  open: () => {},
  close: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifs, setNotifs] = useState<AppNotification[]>(seed);
  const [isOpen, setIsOpen] = useState(false);

  const hasUnread = notifs.some((n) => !n.read);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Mark all read on close
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return (
    <NotifContext.Provider value={{ notifications: notifs, isOpen, hasUnread, open, close }}>
      {children}
    </NotifContext.Provider>
  );
}

export const useNotifications = () => useContext(NotifContext);
