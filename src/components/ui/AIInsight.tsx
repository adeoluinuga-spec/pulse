import clsx from "clsx";
import type { AIRec, AIRecommendation } from "@/data/mockData";
import Skeleton from "./Skeleton";

const recConfig: Record<
  AIRecommendation,
  {
    headline: string;
    subtext: string;
    accent: string;
    dot: string;
    bar: string;
  }
> = {
  promote: {
    headline: "Pulse sees promotion readiness.",
    subtext: "This person is showing strong signals for the next level.",
    accent: "text-green",
    dot: "bg-green",
    bar: "bg-green",
  },
  good_standing: {
    headline: "Pulse sees consistent momentum.",
    subtext: "Performing well and on track for a strong cycle finish.",
    accent: "text-pulse",
    dot: "bg-pulse",
    bar: "bg-pulse",
  },
  pip: {
    headline: "Pulse noticed a performance gap.",
    subtext: "A structured support plan may help close the gap.",
    accent: "text-amber",
    dot: "bg-amber",
    bar: "bg-amber",
  },
  exit_risk: {
    headline: "Pulse is flagging an exit risk.",
    subtext: "This person's signals suggest disengagement or inability to meet expectations.",
    accent: "text-red",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
};

interface AIInsightProps {
  aiRec: AIRec;
  className?: string;
  loading?: boolean;
}

export default function AIInsight({ aiRec, className, loading = false }: AIInsightProps) {
  const config = recConfig[aiRec.recommendation];
  const confidencePct = Math.round(aiRec.confidence * 100);

  return (
    <div className={clsx("bg-ink rounded-lg p-5", className)}>
      <div className="flex items-center gap-2 mb-4">
        <span className={clsx("w-1 h-3.5 rounded-full flex-shrink-0", config.dot)} />
        <span className="type-label text-white/65">Pulse AI · Appraisal Signal</span>
      </div>

      <p
        className={clsx("text-base font-semibold leading-snug mb-1", config.accent)}
        style={{ fontFamily: "var(--font-syne)" }}
      >
        {config.headline}
      </p>
      <p className="text-white/65 text-xs leading-relaxed mb-4">{config.subtext}</p>

      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] text-white/65 font-medium uppercase tracking-widest">
            Confidence
          </span>
          <span className={clsx("text-sm font-semibold", config.accent)}>{confidencePct}%</span>
        </div>
        <div className="h-[3px] bg-white/10 rounded-full overflow-hidden">
          <div
            className={clsx("h-full rounded-full transition-all duration-700", config.bar)}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton width="100%" height={10} />
          <Skeleton width="88%" height={10} />
          <Skeleton width="72%" height={10} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {aiRec.evidence.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={clsx("w-1 h-1 rounded-full mt-1.5 flex-shrink-0", config.dot)} />
              <p className="text-xs text-white/65 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
