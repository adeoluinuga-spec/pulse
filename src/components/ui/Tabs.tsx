import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  key: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-lg border border-paper-200 bg-paper-50 p-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] font-semibold transition-colors",
              active ? "bg-surface text-cobalt shadow-sm" : "text-ink-400 hover:bg-surface hover:text-ink",
            )}
          >
            {Icon && <Icon size={15} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
