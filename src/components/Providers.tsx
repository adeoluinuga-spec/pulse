"use client";

import type { ReactNode } from "react";
import { UserProvider } from "@/context/UserContext";
import { RoleProvider } from "@/context/RoleContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ToastProvider } from "@/components/ui/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UserProvider>
        <RoleProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </RoleProvider>
      </UserProvider>
    </ToastProvider>
  );
}
