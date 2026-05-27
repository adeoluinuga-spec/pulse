"use client";

import {
  createContext, useContext, useCallback,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export type RoleKey = "employee" | "manager" | "hr" | "executive";

export interface RoleConfig {
  key: RoleKey;
  label: string;
  path: string;
  initials: string;
  color: string;
}

export const ROLES: Record<RoleKey, RoleConfig> = {
  employee:  { key: "employee",  label: "Employee",  path: "/dashboard/employee",  initials: "AO", color: "#3b5bdb" },
  manager:   { key: "manager",   label: "Manager",   path: "/dashboard/manager",   initials: "BA", color: "#7048ae" },
  hr:        { key: "hr",        label: "HR Admin",  path: "/dashboard/hr",        initials: "HR", color: "#0c8599" },
  executive: { key: "executive", label: "Executive", path: "/dashboard/executive", initials: "ZC", color: "#d9480f" },
};

export const ROLE_LIST = Object.values(ROLES) as RoleConfig[];

const PATH_TO_ROLE: Record<string, RoleKey> = Object.fromEntries(
  ROLE_LIST.map((r) => [r.path, r.key])
);

interface RoleContextValue {
  role: RoleKey;
  config: RoleConfig;
  navigate: (key: RoleKey) => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: "employee",
  config: ROLES.employee,
  navigate: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  const role   = PATH_TO_ROLE[pathname] ?? "employee";
  const config = ROLES[role];

  const navigate = useCallback(
    (key: RoleKey) => router.push(ROLES[key].path),
    [router]
  );

  return (
    <RoleContext.Provider value={{ role, config, navigate }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);
