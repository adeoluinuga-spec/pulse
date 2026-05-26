"use client";

import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";

const roles = [
  { label: "Employee", path: "/dashboard/employee" },
  { label: "Manager", path: "/dashboard/manager" },
  { label: "HR", path: "/dashboard/hr" },
  { label: "Executive", path: "/dashboard/executive" },
];

export default function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="bg-cream border-b border-border h-12 flex items-center px-4 gap-2 overflow-x-auto scrollbar-none">
      {roles.map((role) => (
        <button
          key={role.path}
          onClick={() => router.push(role.path)}
          className={clsx(
            "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150",
            pathname === role.path
              ? "bg-pulse text-white shadow-sm"
              : "bg-card text-muted border border-border hover:border-pulse hover:text-pulse"
          )}
        >
          {role.label}
        </button>
      ))}
    </div>
  );
}
