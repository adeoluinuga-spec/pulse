import clsx from "clsx";

interface SectionLabelProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export default function SectionLabel({ children, right, className }: SectionLabelProps) {
  return (
    <div className={clsx("flex items-center justify-between mb-3", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        {children}
      </span>
      {right && <span className="text-xs text-muted">{right}</span>}
    </div>
  );
}
