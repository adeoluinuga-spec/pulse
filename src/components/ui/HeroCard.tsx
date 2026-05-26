import clsx from "clsx";
import type { Employee } from "@/data/mockData";
import Badge from "./Badge";
import Avatar from "./Avatar";

interface HeroCardProps {
  employee: Employee;
  className?: string;
}

export default function HeroCard({ employee, className }: HeroCardProps) {
  return (
    <div className={clsx("bg-ink rounded-2xl p-5 text-white", className)}>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <Avatar
            initials={employee.initials}
            color={employee.avatarColor}
            size="md"
          />
          <div>
            <h2
              className="text-white text-lg font-bold leading-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {employee.name}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">{employee.role}</p>
            <p className="text-white/40 text-[10px]">{employee.department}</p>
          </div>
        </div>
        <Badge type={employee.badge} />
      </div>

      <div className="mb-5">
        <div className="flex items-end gap-2">
          <span
            className="text-white font-bold leading-none"
            style={{ fontFamily: "var(--font-syne)", fontSize: "4rem" }}
          >
            {employee.performanceScore}
          </span>
          <div className="pb-2">
            <span className="text-white/40 text-sm">/100</span>
            <p className="text-white/50 text-[11px]">Performance Score</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
        <div className="text-center">
          <p className="text-white font-bold text-lg" style={{ fontFamily: "var(--font-syne)" }}>
            {employee.consistencyIndex}
          </p>
          <p className="text-white/40 text-[10px] mt-0.5">Consistency</p>
        </div>
        <div className="text-center border-x border-white/10">
          <p className="text-white font-bold text-lg" style={{ fontFamily: "var(--font-syne)" }}>
            {employee.peerRating.toFixed(1)}
          </p>
          <p className="text-white/40 text-[10px] mt-0.5">Peer Rating</p>
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-lg" style={{ fontFamily: "var(--font-syne)" }}>
            {employee.weekStreak}w
          </p>
          <p className="text-white/40 text-[10px] mt-0.5">Streak</p>
        </div>
      </div>
    </div>
  );
}
