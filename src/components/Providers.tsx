"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/context/RoleContext";
import { NotificationProvider } from "@/context/NotificationContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </RoleProvider>
  );
}
