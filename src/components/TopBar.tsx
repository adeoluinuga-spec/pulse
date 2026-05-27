export default function TopBar() {
  return (
    <div className="h-14 bg-ink md:bg-card md:border-b md:border-border flex items-center justify-between px-4 md:px-6 shadow-sm md:shadow-none">
      <div className="flex items-center gap-2">
        <span
          className="text-white text-xl font-bold tracking-tight md:hidden"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Pulse
        </span>
        <span
          className="hidden text-xl font-bold tracking-tight text-ink md:inline"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Command Center
        </span>
        <span className="hidden md:inline-flex rounded-full border border-pulse/20 bg-pulse-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-pulse">
          Live Mock
        </span>
        <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot md:hidden" />
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-white md:text-ink text-xs font-medium leading-none">Zenith Corp</p>
          <p className="text-white/50 md:text-muted text-[10px] mt-0.5">May 2026 cycle</p>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white/10 md:ring-border"
          style={{ backgroundColor: "#3b5bdb" }}
        >
          AO
        </div>
      </div>
    </div>
  );
}
