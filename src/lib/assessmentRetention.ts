export const DEFAULT_RETENTION_DAYS = 365;

export type RetentionConfig = {
  retentionDays: number;
};

export type CycleClosure = {
  status?: string | null;
  closesOn?: string | null;
};

export type DeletionCertificate = {
  certificateId: string;
  cycleId: string;
  deletedAt: string;
  retentionDays: number;
  reason: "manual" | "scheduled";
  counts: Record<string, number>;
};

export function parseRetentionConfig(clientContext: unknown, fallbackDays = DEFAULT_RETENTION_DAYS): RetentionConfig {
  const parsed = typeof clientContext === "string" ? safeJson(clientContext) : clientContext;
  const days = Number((parsed as { retentionDays?: unknown; retention_days?: unknown } | null)?.retentionDays
    ?? (parsed as { retention_days?: unknown } | null)?.retention_days
    ?? fallbackDays);

  return {
    retentionDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : fallbackDays,
  };
}

export function withRetentionConfig(clientContext: unknown, retentionDays: number): string {
  const parsed = typeof clientContext === "string" ? safeJson(clientContext) : clientContext;
  const base = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { note: String(clientContext ?? "") };
  return JSON.stringify({ ...base, retentionDays: Math.max(1, Math.floor(retentionDays)) });
}

export function retentionCutoffDate(closesOn: string | null | undefined, retentionDays: number): Date | null {
  if (!closesOn) return null;
  const closeDate = new Date(`${closesOn}T23:59:59.999Z`);
  if (Number.isNaN(closeDate.getTime())) return null;
  closeDate.setUTCDate(closeDate.getUTCDate() + retentionDays);
  return closeDate;
}

export function isCycleDueForPurge(input: {
  closesOn?: string | null;
  clientContext?: unknown;
  now?: Date;
  fallbackDays?: number;
}): boolean {
  const config = parseRetentionConfig(input.clientContext, input.fallbackDays);
  const cutoff = retentionCutoffDate(input.closesOn, config.retentionDays);
  if (!cutoff) return false;
  return cutoff.getTime() <= (input.now ?? new Date()).getTime();
}

export function cycleSubmissionClosed(cycle: CycleClosure, now = new Date()): string | null {
  if (cycle.status && cycle.status !== "collecting") {
    return "This assessment cycle is no longer collecting responses. Please contact HR if you think this is a mistake.";
  }
  if (cycle.closesOn) {
    const closesAt = new Date(`${cycle.closesOn}T23:59:59.999Z`);
    if (!Number.isNaN(closesAt.getTime()) && closesAt.getTime() < now.getTime()) {
      return "This assessment cycle has closed and is no longer accepting responses.";
    }
  }
  return null;
}

export function buildDeletionCertificate(input: {
  cycleId: string;
  retentionDays: number;
  reason: "manual" | "scheduled";
  counts: Record<string, number>;
  deletedAt?: string;
}): DeletionCertificate {
  const deletedAt = input.deletedAt ?? new Date().toISOString();
  return {
    certificateId: `pulse-delete-${input.cycleId}-${deletedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    cycleId: input.cycleId,
    deletedAt,
    retentionDays: input.retentionDays,
    reason: input.reason,
    counts: input.counts,
  };
}

function safeJson(value: string): unknown {
  try {
    return value.trim() ? JSON.parse(value) : {};
  } catch {
    return { note: value };
  }
}
