import DashboardTabBar from "@/components/layout/DashboardTabBar";
import BottomNav from "@/components/layout/BottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <DashboardTabBar />
      <main className="flex-1 animate-fade-in" style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
