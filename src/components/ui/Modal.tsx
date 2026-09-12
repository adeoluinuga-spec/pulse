import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";

export function Modal({
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
    <div className="fixed inset-0 z-[200] grid place-items-center bg-ink/50 px-4">
      <div className={cn("max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-[10px] border border-paper-200 bg-surface shadow-xl", className)}>
        <div className="flex items-center justify-between border-b border-paper-100 px-5 py-4">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close modal">
            <X size={15} />
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
