"use client";

import clsx from "clsx";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

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

const meta: Record<ToastType, { label: string; Icon: typeof CheckCircle2; accent: string; icon: string }> = {
  success: { label: "Success", Icon: CheckCircle2, accent: "border-green/25", icon: "bg-green-soft text-green" },
  error: { label: "Action needed", Icon: XCircle, accent: "border-red/25", icon: "bg-red-soft text-red" },
  info: { label: "Update", Icon: Info, accent: "border-pulse/25", icon: "bg-pulse-soft text-pulse" },
  warning: { label: "Please check", Icon: AlertTriangle, accent: "border-amber/25", icon: "bg-amber-soft text-amber" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [{ id, message, type }, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 7000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-[calc(70px+env(safe-area-inset-top,0px))] z-[300] flex flex-col items-center gap-3 sm:inset-x-auto sm:right-5 sm:items-end">
        {toasts.map((toast) => {
          const { Icon, ...tone } = meta[toast.type];
          return (
          <div
            key={toast.id}
            role="alert"
            aria-live="assertive"
            className={clsx(
              "pointer-events-auto w-full max-w-[420px] rounded-lg border bg-white p-4 text-left shadow-[var(--shadow-lg)] toast-slide",
              tone.accent,
            )}
          >
            <div className="flex items-start gap-3">
              <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", tone.icon)}>
                <Icon size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{tone.label}</p>
                <p className="mt-1 text-sm leading-5 text-muted">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-ink px-4 text-xs font-semibold text-white transition hover:bg-ink/90"
                >
                  OK
                </button>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink"
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
