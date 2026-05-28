"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { employees } from "@/data/mockData";
import type { Employee, Notification } from "@/types";

interface UserContextValue {
  user: Employee;
  setActiveUser: (employeeId: string) => void;
  notifications: Notification[];
  hasUnread: boolean;
  notifOpen: boolean;
  openNotif: () => void;
  closeNotif: () => void;
}

const DEFAULT_USER = employees.find((e) => e.id === "e01") ?? employees[0];

const UserContext = createContext<UserContextValue>({
  user: DEFAULT_USER,
  setActiveUser: () => {},
  notifications: DEFAULT_USER.notifications,
  hasUnread: DEFAULT_USER.notifications.some((n) => !n.read),
  notifOpen: false,
  openNotif: () => {},
  closeNotif: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("e01");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>(
    () => [...DEFAULT_USER.notifications],
  );

  const user = employees.find((e) => e.id === userId) ?? employees[0];

  useEffect(() => {
    const emp = employees.find((e) => e.id === userId) ?? employees[0];
    setNotifs([...emp.notifications]);
  }, [userId]);

  const setActiveUser = useCallback((id: string) => {
    setUserId(id);
  }, []);

  const hasUnread = notifs.some((n) => !n.read);

  const openNotif = useCallback(() => setNotifOpen(true), []);

  const closeNotif = useCallback(() => {
    setNotifOpen(false);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return (
    <UserContext.Provider
      value={{ user, setActiveUser, notifications: notifs, hasUnread, notifOpen, openNotif, closeNotif }}
    >
      {children}
      <DevUserSwitcher />
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);

// ── DEV-only user switcher ─────────────────────────────────────────────────────

function DevUserSwitcher() {
  const { user, setActiveUser } = useUser();
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Switch mock user"
        className="fixed bottom-24 right-3 z-[200] w-9 h-9 bg-ink text-white rounded-full flex items-center justify-center shadow-xl text-[10px] font-bold tracking-wider border border-white/20 active:scale-95 transition-transform"
      >
        DEV
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[210] bg-black/50"
          />
          <div className="fixed inset-x-0 bottom-0 z-[220] flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[430px] bg-card rounded-t-3xl max-h-[65vh] flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
                <span className="text-xs font-bold text-ink uppercase tracking-widest">
                  Switch Mock User
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-muted font-medium"
                >
                  Done
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                {employees.map((emp) => {
                  const active = emp.id === user.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => { setActiveUser(emp.id); setOpen(false); }}
                      className="w-full flex items-center gap-3 px-5 py-3 border-b border-border last:border-none hover:bg-paper active:bg-paper transition-colors"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: emp.avatarColor }}
                      >
                        {emp.initials}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className={`text-sm font-semibold truncate ${active ? "text-pulse" : "text-ink"}`}>
                          {emp.name}
                        </p>
                        <p className="text-[11px] text-muted truncate">
                          {emp.role} · {emp.department}
                        </p>
                      </div>
                      {active && (
                        <span className="w-2 h-2 rounded-full bg-pulse flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="h-safe flex-shrink-0" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
