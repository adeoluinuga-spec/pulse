import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";

export function Drawer({
  open,
  title,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-ink/35">
      <aside className={cn("ml-auto flex h-full w-full max-w-md flex-col border-l border-paper-200 bg-surface shadow-xl", className)}>
        <div className="flex items-center justify-between border-b border-paper-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close drawer">
            <X size={15} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
