import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { TrendDir } from "@/data/mockData";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: TrendDir;
  trendLabel?: string;
  accent?: boolean;
  className?: string;
}

const trendIcon = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const trendColor = {
  up: "text-green",
  down: "text-red",
  flat: "text-muted",
};

export default function StatCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  accent = false,
  className,
}: StatCardProps) {
  const TrendIcon = trend ? trendIcon[trend] : null;

  return (
    <div
      className={clsx(
        "rounded-2xl p-4 flex flex-col gap-1",
        accent ? "bg-ink text-white" : "bg-card border border-border",
        className
      )}
    >
      <span
        className={clsx(
          "text-[11px] font-medium uppercase tracking-widest",
          accent ? "text-white/50" : "text-muted"
        )}
      >
        {label}
      </span>
      <span
        className={clsx(
          "text-3xl font-bold leading-none",
          accent ? "text-white" : "text-ink"
        )}
        style={{ fontFamily: "var(--font-syne)" }}
      >
        {value}
      </span>
      {(sub || (trend && trendLabel)) && (
        <div className="flex items-center gap-1 mt-0.5">
          {TrendIcon && (
            <TrendIcon
              size={11}
              className={accent ? "text-white/60" : trendColor[trend!]}
            />
          )}
          <span
            className={clsx(
              "text-[11px]",
              accent
                ? "text-white/60"
                : trend
                ? trendColor[trend]
                : "text-muted"
            )}
          >
            {trendLabel || sub}
          </span>
        </div>
      )}
    </div>
  );
}
