import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Return a Tailwind text-color class based on score band */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-amber";
  if (score >= 40) return "text-pulse";
  return "text-red";
}

/** Return score with its color class as an object */
export function formatScore(score: number): { value: string; colorClass: string } {
  return { value: `${score}%`, colorClass: getScoreColor(score) };
}

/** Format a number as NGN (or other currency) */
export function formatCurrency(amount: number, currency = "NGN"): string {
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Shorten large naira amounts (₦1.2M, ₦850K) */
export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}K`;
  return `₦${amount}`;
}

/** Format a date string to e.g. "14 May 2026" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
