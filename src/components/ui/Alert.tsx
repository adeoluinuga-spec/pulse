import clsx from "clsx";
import { Info, AlertTriangle, XCircle, CheckCircle } from "lucide-react";

type AlertVariant = "info" | "warning" | "error" | "success";

const variantConfig: Record<
  AlertVariant,
  { bg: string; text: string; border: string; Icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  info: { bg: "bg-pulse-soft", text: "text-pulse", border: "border-pulse/20", Icon: Info },
  warning: { bg: "bg-amber-soft", text: "text-amber", border: "border-amber/20", Icon: AlertTriangle },
  error: { bg: "bg-red-soft", text: "text-red", border: "border-red/20", Icon: XCircle },
  success: { bg: "bg-green-soft", text: "text-green", border: "border-green/20", Icon: CheckCircle },
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  className?: string;
}

export default function Alert({ variant = "info", title, message, className }: AlertProps) {
  const { bg, text, border, Icon } = variantConfig[variant];

  return (
    <div className={clsx("rounded-lg border p-4 flex gap-3", bg, border, className)}>
      <Icon size={16} className={clsx("flex-shrink-0 mt-0.5", text)} />
      <div className="min-w-0">
        {title && (
          <p className={clsx("text-sm font-semibold mb-0.5", text)}>{title}</p>
        )}
        <p className={clsx("text-sm leading-relaxed", text, !title && "font-medium")}>{message}</p>
      </div>
    </div>
  );
}
