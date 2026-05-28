import clsx from "clsx";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

function cssSize(value?: string | number) {
  return typeof value === "number" ? `${value}px` : value;
}

export default function Skeleton({ width = "100%", height = 16, borderRadius = 8, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx("block overflow-hidden bg-border skeleton-shimmer", className)}
      style={{
        width: cssSize(width),
        height: cssSize(height),
        borderRadius: cssSize(borderRadius),
      }}
    />
  );
}

export function SkeletonRows({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx("space-y-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-4">
          <Skeleton width="70%" height={14} />
          <Skeleton width="100%" height={8} className="mt-3" />
          <Skeleton width="45%" height={10} className="mt-3" />
        </div>
      ))}
    </div>
  );
}
