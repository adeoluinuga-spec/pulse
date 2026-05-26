export default function TopBar() {
  return (
    <div className="h-14 bg-ink flex items-center justify-between px-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="text-white text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Pulse
        </span>
        <span className="w-2.5 h-2.5 rounded-full bg-pulse animate-pulse-dot" />
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-white text-xs font-medium leading-none">Zenith Corp</p>
          <p className="text-white/50 text-[10px] mt-0.5">May 2026 cycle</p>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
          style={{ backgroundColor: "#3b5bdb" }}
        >
          AO
        </div>
      </div>
    </div>
  );
}
