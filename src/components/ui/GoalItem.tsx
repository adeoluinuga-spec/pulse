import clsx from "clsx";
import type { Goal } from "@/data/mockData";
import ProgressBar from "./ProgressBar";
import Skeleton from "./Skeleton";

const typeLabel: Record<Goal["type"], string> = {
  org: "Org",
  dept: "Dept",
  team: "Team",
  individual: "Individual",
};

const typeColor: Record<Goal["type"], string> = {
  org: "bg-ink text-white",
  dept: "bg-pulse-soft text-pulse",
  team: "bg-green-soft text-green",
  individual: "bg-border text-muted",
};

const statusLabel: Record<Goal["status"], string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  behind: "Behind",
  completed: "Done",
};

const statusColor: Record<Goal["status"], string> = {
  on_track: "text-green",
  at_risk: "text-amber",
  behind: "text-red",
  completed: "text-pulse",
};

interface GoalItemProps {
  goal: Goal;
  className?: string;
  loading?: boolean;
}

export default function GoalItem({ goal, className, loading = false }: GoalItemProps) {
  if (loading) {
    return (
      <div className={clsx("py-3.5", className)}>
        <Skeleton width="75%" height={14} />
        <Skeleton width="100%" height={8} className="mt-3" />
        <Skeleton width="45%" height={10} className="mt-3" />
      </div>
    );
  }

  const formattedDate = new Date(goal.dueDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className={clsx("py-3.5", className)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0",
              typeColor[goal.type]
            )}
          >
            {typeLabel[goal.type]}
          </span>
          <span className="text-sm font-medium text-ink truncate">{goal.name}</span>
        </div>
        <span
          className={clsx(
            "text-[11px] font-semibold flex-shrink-0",
            statusColor[goal.status]
          )}
        >
          {statusLabel[goal.status]}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={goal.percentComplete} status={goal.status} className="flex-1" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-ink">{goal.percentComplete}%</span>
          <span className="text-[11px] text-muted">· {formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
