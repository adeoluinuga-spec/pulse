"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

export default function PWAInstallPrompt() {
  const [visible, setVisible]             = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    if (sessionStorage.getItem("pulse-pwa-dismissed")) return;
    if (sessionStorage.getItem("pulse-pwa-shown")) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const timer = setTimeout(() => {
      sessionStorage.setItem("pulse-pwa-shown", "1");
      setVisible(true);
    }, 45_000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem("pulse-pwa-dismissed", "1");
  }

  async function install() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setVisible(false);
      setDeferredPrompt(null);
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,12px))] left-4 right-4 z-[100] mx-auto max-w-[430px] animate-sheet-up md:bottom-6 md:left-auto md:right-6 md:w-80">
      <div className="bg-ink text-white rounded-lg p-4 flex items-center gap-3 shadow-2xl border border-pulse/25">
        <div className="w-9 h-9 rounded-lg bg-pulse/20 flex items-center justify-center flex-shrink-0">
          <Download size={16} className="text-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Add Pulse to your home screen
          </p>
          <p className="text-[11px] text-white/65 mt-0.5">
            Works offline and feels native
          </p>
        </div>

        <button
          onClick={install}
          className="flex-shrink-0 px-3 py-1.5 bg-pulse text-white text-xs font-semibold rounded-lg hover:bg-pulse/90 transition-colors"
        >
          Install
        </button>

        <button
          onClick={dismiss}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/10 text-white/65 hover:text-white transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
