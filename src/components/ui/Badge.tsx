import clsx from "clsx";
import type { BadgeType } from "@/data/mockData";

const variants: Record<BadgeType, string> = {
  "Good Standing": "bg-green-soft text-green",
  "Strong Performer": "bg-pulse-soft text-pulse",
  "Needs Improvement": "bg-amber-soft text-amber",
  "At Risk": "bg-red-soft text-red",
};

interface BadgeProps {
  type: BadgeType;
  className?: string;
}

export default function Badge({ type, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide whitespace-nowrap",
        variants[type],
        className
      )}
    >
      {type}
    </span>
  );
}
