import clsx from "clsx";

/* eslint-disable @next/next/no-img-element */

interface AvatarProps {
  initials: string;
  color: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  imageUrl?: string;
}

const sizeMap = {
  xs: "w-7 h-7 text-[10px]",
  sm: "w-9 h-9 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-14 h-14 text-base",
};

export default function Avatar({ initials, color, size = "md", className, imageUrl }: AvatarProps) {
  return (
    <div
      className={clsx(
        "rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 overflow-hidden shadow-[0_8px_24px_rgba(13,13,13,0.12)] ring-2 ring-white/80",
        sizeMap[size],
        className
      )}
      style={{ backgroundColor: color }}
    >
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  );
}
