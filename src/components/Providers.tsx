"use client";

import type { ReactNode } from "react";
import { UserProvider } from "@/context/UserContext";
import { RoleProvider } from "@/context/RoleContext";
import { NotificationProvider } from "@/context/NotificationContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <RoleProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </RoleProvider>
    </UserProvider>
  );
}
