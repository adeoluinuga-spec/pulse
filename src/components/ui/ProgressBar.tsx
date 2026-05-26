import clsx from "clsx";
import type { GoalStatus } from "@/data/mockData";

const statusColor: Record<GoalStatus, string> = {
  on_track: "bg-green",
  at_risk: "bg-amber",
  behind: "bg-red",
  completed: "bg-pulse",
};

interface ProgressBarProps {
  value: number;
  status?: GoalStatus;
  showLabel?: boolean;
  className?: string;
  height?: "thin" | "normal";
}

export default function ProgressBar({
  value,
  status = "on_track",
  showLabel = false,
  className,
  height = "normal",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={clsx("w-full", className)}>
      <div
        className={clsx(
          "w-full bg-border rounded-full overflow-hidden",
          height === "thin" ? "h-1" : "h-1.5"
        )}
      >
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-500",
            statusColor[status]
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] text-muted mt-1 block">{clamped}%</span>
      )}
    </div>
  );
}
