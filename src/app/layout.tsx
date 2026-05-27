import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";
import TopBar from "@/components/TopBar";
import RoleSwitcher from "@/components/RoleSwitcher";
import BottomNav from "@/components/BottomNav";
import SidePanel from "@/components/SidePanel";

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
  themeColor: "#e8440a",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen bg-paper text-ink">
        <SidePanel />
        <div className="min-h-screen md:pl-72">
          <header className="fixed top-0 left-0 right-0 z-40 md:left-72">
            <TopBar />
            <RoleSwitcher />
          </header>
          <main className="min-h-screen bg-paper pt-[104px] pb-24 md:bg-card md:pt-[72px] md:pb-10">
            <div className="mx-auto w-full max-w-7xl md:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
