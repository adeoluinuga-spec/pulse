"use client";

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-paper text-2xl">{icon}</div>
      <p className="mt-3 text-sm font-bold text-ink">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{subtitle}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-4 rounded-lg bg-pulse px-4 py-2 text-sm font-bold text-white">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
