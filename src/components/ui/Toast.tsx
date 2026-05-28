"use client";

import clsx from "clsx";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const tone: Record<ToastType, string> = {
  success: "bg-green text-white",
  error: "bg-red text-white",
  info: "bg-pulse text-white",
  warning: "bg-amber text-white",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [{ id, message, type }, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-[calc(56px+env(safe-area-inset-top,0px)+12px)] z-[300] flex w-[min(92vw,390px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx("pointer-events-auto rounded-full px-4 py-2 text-sm font-bold shadow-[var(--shadow-lg)] toast-slide", tone[toast.type])}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
