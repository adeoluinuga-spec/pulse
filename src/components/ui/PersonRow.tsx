import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { Employee } from "@/data/mockData";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Skeleton from "./Skeleton";

interface PersonRowProps {
  employee: Employee;
  showScore?: boolean;
  onClick?: () => void;
  className?: string;
  loading?: boolean;
}

export default function PersonRow({
  employee,
  showScore = true,
  onClick,
  className,
  loading = false,
}: PersonRowProps) {
  const Wrapper = onClick ? "button" : "div";

  if (loading) {
    return (
      <div className={clsx("flex items-center gap-3 py-3.5", className)}>
        <Skeleton width={36} height={36} borderRadius="999px" />
        <div className="flex-1">
          <Skeleton width="65%" height={12} />
          <Skeleton width="42%" height={9} className="mt-2" />
        </div>
        <Skeleton width={48} height={20} borderRadius={999} />
      </div>
    );
  }

  return (
    <Wrapper
      className={clsx(
        "w-full flex items-center gap-3 py-3.5 text-left",
        onClick && "hover:bg-cream/50 transition-colors rounded-xl -mx-1 px-1",
        className
      )}
      onClick={onClick}
    >
      <Avatar initials={employee.initials} color={employee.avatarColor} size="sm" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink leading-tight truncate">{employee.name}</p>
        <p className="text-[11px] text-muted mt-0.5 truncate">
          {employee.role} · {employee.department}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {showScore && (
          <span
            className="text-base font-bold text-ink"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {employee.performanceScore}
          </span>
        )}
        <Badge type={employee.badge} />
        {onClick && <ChevronRight size={14} className="text-muted" />}
      </div>
    </Wrapper>
  );
}
