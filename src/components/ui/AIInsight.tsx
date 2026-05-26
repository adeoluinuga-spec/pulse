import clsx from "clsx";
import { TrendingUp, Star, AlertTriangle, AlertOctagon, CheckCircle } from "lucide-react";
import type { AIRec, AIRecommendation } from "@/data/mockData";

const recConfig: Record<
  AIRecommendation,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  promote: {
    label: "Recommend Promotion",
    color: "text-green",
    bg: "bg-green-soft",
    border: "border-green/30",
    Icon: TrendingUp,
  },
  good_standing: {
    label: "Good Standing",
    color: "text-pulse",
    bg: "bg-pulse-soft",
    border: "border-pulse/30",
    Icon: Star,
  },
  pip: {
    label: "Performance Improvement Plan",
    color: "text-amber",
    bg: "bg-amber-soft",
    border: "border-amber/30",
    Icon: AlertTriangle,
  },
  exit_risk: {
    label: "Exit Risk",
    color: "text-red",
    bg: "bg-red-soft",
    border: "border-red/30",
    Icon: AlertOctagon,
  },
};

interface AIInsightProps {
  aiRec: AIRec;
  className?: string;
}

export default function AIInsight({ aiRec, className }: AIInsightProps) {
  const config = recConfig[aiRec.recommendation];
  const { label, color, bg, border, Icon } = config;
  const confidencePct = Math.round(aiRec.confidence * 100);

  return (
    <div className={clsx("rounded-2xl border p-4", bg, border, className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center bg-white/60")}>
            <Icon size={14} className={color} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              AI Assessment
            </p>
            <p className={clsx("text-sm font-bold", color)}>{label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={clsx("text-2xl font-bold leading-none", color)} style={{ fontFamily: "var(--font-syne)" }}>
            {confidencePct}%
          </p>
          <p className="text-[10px] text-muted mt-0.5">confidence</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {aiRec.evidence.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <CheckCircle size={12} className={clsx("flex-shrink-0 mt-0.5", color)} />
            <p className="text-xs text-ink/80 leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
