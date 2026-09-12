import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      {hint && <span className="ml-2 text-xs text-ink-300">{hint}</span>}
      {children}
    </label>
  );
}

export const fieldInput =
  "mt-1.5 h-10 w-full rounded-md border border-paper-300 bg-surface px-3 text-xs text-ink outline-none transition focus:border-cobalt focus:shadow-[0_0_0_3px_var(--pulse-soft)]";
