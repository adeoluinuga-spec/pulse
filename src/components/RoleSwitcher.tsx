"use client";

import clsx from "clsx";
import { useRole, ROLE_LIST } from "@/context/RoleContext";

export default function RoleSwitcher() {
  const { role, navigate } = useRole();

  return (
    <div className="bg-ink border-b border-white/8 h-12 flex items-center px-4 gap-2 overflow-x-auto scrollbar-none md:hidden">
      {ROLE_LIST.map((r) => {
        const isActive = role === r.key;
        return (
          <button
            key={r.key}
            onClick={() => navigate(r.key)}
            className={clsx(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200",
              isActive
                ? "bg-pulse text-white shadow-sm"
                : "bg-transparent text-white/50 border border-white/20 hover:text-white hover:border-white/50"
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
