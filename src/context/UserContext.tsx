"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { employees } from "@/data/mockData";
import type { Employee, Notification } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { getSupabase } from "@/lib/supabase";
import { getMyProfile } from "@/lib/api/profile";
import { getMyNotifications } from "@/lib/api/notifications";

interface UserContextValue {
  user: Employee;
  authUser: SupabaseUser | null;
  session: Session | null;
  loading: boolean;
  orgName: string;
  setActiveUser: (employeeId: string) => void;
  signOut: () => Promise<void>;
  profileImages: Record<string, string>;
  setProfileImage: (employeeId: string, imageDataUrl: string) => void;
  notifications: Notification[];
  hasUnread: boolean;
  notifOpen: boolean;
  openNotif: () => void;
  closeNotif: () => void;
}

const DEFAULT_USER = employees.find((e) => e.id === "e01") ?? employees[0];

function authFallbackEmployee(authSession: Session): Employee {
  const email = authSession.user.email ?? "user@pulse.local";
  const name = email.split("@")[0]?.replace(/[._-]/g, " ") || "Pulse User";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "PU";

  return {
    ...DEFAULT_USER,
    id: authSession.user.id,
    name,
    initials,
    email,
    phone: "",
    homeAddress: "",
    department: "",
    team: "",
    role: "",
    platformRole: "standard",
    goals: [],
    kpis: [],
    reports: [],
    appraisalComponents: [],
    trainingSuggestions: [],
    wellbeingHistory: [],
    documents: [],
    meetings: [],
    tasks: [],
    notifications: [],
  };
}

const UserContext = createContext<UserContextValue>({
  user: DEFAULT_USER,
  authUser: null,
  session: null,
  loading: true,
  orgName: "",
  setActiveUser: () => {},
  signOut: async () => {},
  profileImages: {},
  setProfileImage: () => {},
  notifications: DEFAULT_USER.notifications,
  hasUnread: DEFAULT_USER.notifications.some((n) => !n.read),
  notifOpen: false,
  openNotif: () => {},
  closeNotif: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [userId, setUserId] = useState("e01");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileImages, setProfileImages] = useState<Record<string, string>>({});
  const [orgName, setOrgName] = useState("");
  const [notifs, setNotifs] = useState<Notification[]>(
    () => [...DEFAULT_USER.notifications],
  );
  // Track whether we matched a real Supabase employee so we show live data
  const [liveEmployee, setLiveEmployee] = useState<Employee | null>(null);
  // True once we've finished the first auth check — prevents flash of mock data
  const [resolved, setResolved] = useState(false);
  const realtimeRef = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null);

  // In production and resolved: only use real data. In dev / unresolved: allow mock fallback.
  const user = liveEmployee ??
    (process.env.NODE_ENV === "development" || !resolved
      ? employees.find((e) => e.id === userId) ?? employees[0]
      : employees[0]);

  // ── Resolve employee after auth ──────────────────────────────────────────────
  const resolveEmployee = useCallback(async (authSession: Session | null) => {
    const email = authSession?.user.email?.toLowerCase();

    // Try Supabase first
    if (authSession) {
      try {
        const profile = await getMyProfile();
        if (profile) {
          setLiveEmployee(profile);
          setUserId(profile.id);

          // Fetch org name
          const supabase = getSupabase();
          const { data: empRow } = await supabase
            .from("employees")
            .select("org_id")
            .eq("user_id", authSession.user.id)
            .single();
          if (empRow?.org_id) {
            const { data: org } = await supabase
              .from("organisations")
              .select("name")
              .eq("id", (empRow as { org_id: string }).org_id)
              .single();
            if (org) setOrgName((org as { name: string }).name);
          }

          // Try real notifications
          const liveNotifs = await getMyNotifications(30);
          setNotifs(liveNotifs.length ? liveNotifs : [...profile.notifications]);
          return;
        }
      } catch {
        // fall through to mock
      }
    }

    if (authSession) {
      const mockEmp = process.env.NODE_ENV === "development" && email
        ? employees.find((e) => e.email.toLowerCase() === email)
        : undefined;
      const fallback = mockEmp ?? authFallbackEmployee(authSession);
      setLiveEmployee(fallback);
      setUserId(fallback.id);
      setNotifs([...fallback.notifications]);
      return;
    }

    // In development only: keep the unauthenticated demo usable.
    if (process.env.NODE_ENV === "development") {
      const mockEmp = employees.find((e) => e.email.toLowerCase() === email) ?? DEFAULT_USER;
      setLiveEmployee(null);
      setUserId(mockEmp.id);
      setNotifs([...mockEmp.notifications]);
    }
    // In production: keep liveEmployee null and leave userId as-is.
    // The user is authenticated but profile fetch failed — don't show mock data.
    // Components should handle a null/empty profile gracefully.
  }, []);

  // ── Real-time notification subscription ─────────────────────────────────────
  const subscribeToNotifications = useCallback((empId: string) => {
    // Clean up any existing subscription
    if (realtimeRef.current) {
      realtimeRef.current.unsubscribe();
      realtimeRef.current = null;
    }

    const supabase = getSupabase();
    const channel = supabase
      .channel(`notifications:${empId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `employee_id=eq.${empId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newNotif: Notification = {
            id: row.id as string,
            type: (row.type as Notification["type"]) ?? "info",
            title: row.title as string,
            body: (row.body as string) ?? "",
            date: ((row.created_at as string) ?? "").slice(0, 10),
            read: false,
          };
          setNotifs((prev) => [newNotif, ...prev]);
        },
      )
      .subscribe();

    realtimeRef.current = channel;
  }, []);

  useEffect(() => {
    let active = true;

    getSupabase().auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      resolveEmployee(data.session).finally(() => {
        if (active) { setLoading(false); setResolved(true); }
      });
    });

    const { data: listener } = getSupabase().auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        resolveEmployee(nextSession).finally(() => setLoading(false));
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      realtimeRef.current?.unsubscribe();
    };
  }, [resolveEmployee]);

  // Subscribe to realtime when we have a live employee with a DB id
  useEffect(() => {
    if (liveEmployee?.id) {
      subscribeToNotifications(liveEmployee.id);
    }
    return () => {
      realtimeRef.current?.unsubscribe();
      realtimeRef.current = null;
    };
  }, [liveEmployee?.id, subscribeToNotifications]);

  const setActiveUser = useCallback(
    (id: string) => {
      const emp = employees.find((e) => e.id === id) ?? employees[0];
      setLiveEmployee(null);
      setUserId(id);
      setNotifs([...emp.notifications]);
      showToast(
        `Viewing as ${emp.name} — ${emp.cadre} / ${emp.peopleResponsibility}`,
        "info",
      );
    },
    [showToast],
  );

  const signOut = useCallback(async () => {
    realtimeRef.current?.unsubscribe();
    realtimeRef.current = null;
    await getSupabase().auth.signOut();
    setSession(null);
    setLiveEmployee(null);
    router.replace("/auth/login");
    router.refresh();
  }, [router]);

  const setProfileImage = useCallback(
    (employeeId: string, imageDataUrl: string) => {
      setProfileImages((prev) => ({ ...prev, [employeeId]: imageDataUrl }));
      showToast("Profile image updated", "success");
    },
    [showToast],
  );

  const hasUnread = notifs.some((n) => !n.read);
  const openNotif = useCallback(() => setNotifOpen(true), []);

  const closeNotif = useCallback(() => {
    setNotifOpen(false);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-6 text-center text-ink">
        <div>
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-pulse" />
          <p className="mt-4 text-sm font-bold text-muted">
            Preparing your Pulse workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider
      value={{
        user,
        authUser: session?.user ?? null,
        session,
        loading,
        orgName,
        setActiveUser,
        signOut,
        profileImages,
        setProfileImage,
        notifications: notifs,
        hasUnread,
        notifOpen,
        openNotif,
        closeNotif,
      }}
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
                      onClick={() => {
                        setActiveUser(emp.id);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3 border-b border-border last:border-none hover:bg-paper active:bg-paper transition-colors"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: emp.avatarColor }}
                      >
                        {emp.initials}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${active ? "text-pulse" : "text-ink"}`}
                        >
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

              <div
                className="h-safe flex-shrink-0"
                style={{ height: "env(safe-area-inset-bottom, 0px)" }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
