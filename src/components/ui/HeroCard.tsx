"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Employee } from "@/data/mockData";
import Badge from "./Badge";
import Avatar from "./Avatar";
import Skeleton from "./Skeleton";

interface HeroCardProps {
  employee: Employee;
  className?: string;
  loading?: boolean;
}

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export default function HeroCard({ employee, className, loading = false }: HeroCardProps) {
  const score = useCountUp(employee.performanceScore);

  if (loading) {
    return (
      <div className={clsx("bg-ink rounded-2xl p-5 text-white", className)}>
        <div className="mb-5 flex items-center gap-3">
          <Skeleton width={44} height={44} borderRadius="999px" className="bg-white/10" />
          <div className="flex-1">
            <Skeleton width="62%" height={16} className="bg-white/10" />
            <Skeleton width="42%" height={10} className="mt-2 bg-white/10" />
          </div>
        </div>
        <Skeleton width={120} height={64} className="bg-white/10" />
        <Skeleton width="100%" height={8} className="mt-5 bg-white/10" />
      </div>
    );
  }

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
            {score}
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
