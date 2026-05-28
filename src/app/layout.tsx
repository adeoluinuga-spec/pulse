import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import TopBar from "@/components/layout/TopBar";
import NotificationPanel from "@/components/layout/NotificationPanel";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Pulse — Performance Intelligence",
  description: "AI-powered performance management for modern teams",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulse",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen bg-paper text-ink">
        <Providers>
          {/* Desktop: paper bg fills screen, app column centered at 430px */}
          <div className="min-h-screen bg-paper flex justify-center">
            <div className="relative w-full max-w-[430px] min-h-screen bg-white flex flex-col shadow-[0_0_80px_rgba(13,13,13,0.1)]">
              <TopBar />
              <div className="flex-1">
                {children}
              </div>
            </div>
          </div>

          {/* Full-screen overlays outside the column */}
          <NotificationPanel />
          <PWAInstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
