import { createHash } from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import {
  buildReviewQueue,
  escapeLikePattern,
  queueStatusLabel,
  type QueueAssignmentRow,
} from "@/lib/reviewQueue";

export const dynamic = "force-dynamic";

type ReviewerRow = {
  id: string;
  cycle_id: string;
  reviewer_email: string;
  reviewer_name: string | null;
  token_expires_at: string | null;
};

type AssignmentRow = {
  id: string;
  reviewer_group: string;
  status: string;
  token_expires_at: string | null;
  last_saved_at: string | null;
  submitted_at: string | null;
  assessment_subjects: { name: string | null } | null;
};

type CycleRow = {
  name: string | null;
  closes_on: string | null;
};

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}


function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  Complete: "bg-green-soft text-green ring-green/20",
  "In progress": "bg-blue-50 text-blue-700 ring-blue-200",
  "Not started": "bg-amber-50 text-amber-700 ring-amber-200",
  "Link expired": "bg-red-50 text-red-700 ring-red-200",
};

export default async function ReviewQueuePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = token?.trim();

  if (!trimmed) redirect("/review/contact");

  const admin = getAdminClient();

  const { data: reviewer } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, reviewer_email, reviewer_name, token_expires_at")
    .eq("token_hash", hashToken(trimmed))
    .maybeSingle<ReviewerRow>();

  // An unresolvable or expired entry link cannot establish who is asking, so it
  // must not open somebody's assignment list. Expiry stays a real revocation.
  if (!reviewer) redirect("/review/contact");
  if (
    reviewer.token_expires_at &&
    new Date(reviewer.token_expires_at).getTime() < Date.now()
  ) {
    redirect("/review/contact");
  }

  const [assignmentsResult, cycleResult] = await Promise.all([
    admin
      .from("assessment_reviewers")
      .select(
        "id, reviewer_group, status, token_expires_at, last_saved_at, submitted_at, assessment_subjects(name)",
      )
      .eq("cycle_id", reviewer.cycle_id)
      // The unique key is (subject_id, reviewer_email, reviewer_group), so one
      // address legitimately spans many subjects.
      .ilike("reviewer_email", escapeLikePattern(reviewer.reviewer_email.trim()))
      .returns<AssignmentRow[]>(),
    admin
      .from("assessment_cycles")
      .select("name, closes_on")
      .eq("id", reviewer.cycle_id)
      .maybeSingle<CycleRow>(),
  ]);

  const rows: QueueAssignmentRow[] = (assignmentsResult.data ?? []).map((row) => ({
    id: row.id,
    subject_name: row.assessment_subjects?.name ?? "",
    reviewer_group: row.reviewer_group,
    status: row.status,
    token_expires_at: row.token_expires_at,
    last_saved_at: row.last_saved_at,
    submitted_at: row.submitted_at,
  }));

  const queue = buildReviewQueue(rows, reviewer.id);
  const closesOn = formatDate(cycleResult.data?.closes_on ?? null);
  const firstName = reviewer.reviewer_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-ink">
      <section className="mx-auto w-full max-w-md">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-pulse-soft text-lg font-semibold text-pulse">
          P
        </div>

        <h1 className="mt-5 text-2xl font-semibold leading-tight">
          {firstName ? `${firstName}, your assessments` : "Your assessments"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {cycleResult.data?.name?.trim() || "Pulse 360 assessment"}
          {closesOn ? ` · closes ${closesOn}` : ""}
        </p>

        {/* Progress — the headline number. */}
        <div className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="text-3xl font-semibold leading-none tabular-nums">{queue.progressLabel}</p>
          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink/10"
            role="progressbar"
            aria-valuenow={queue.completed}
            aria-valuemin={0}
            aria-valuemax={queue.total}
            aria-label={queue.progressLabel}
          >
            <div
              className="h-full rounded-full bg-pulse transition-all"
              style={{ width: `${queue.percentComplete}%` }}
            />
          </div>

          {queue.allComplete ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              All done — thank you. Nothing else is waiting on you.
            </p>
          ) : queue.nextUp ? (
            <Link
              href={`/review/queue/${encodeURIComponent(trimmed)}/open/${queue.nextUp.reviewerId}`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white"
            >
              {queue.nextUp.status === "in_progress" ? "Resume" : "Start"} {queue.nextUp.subjectName}
            </Link>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">
              Nothing can be opened right now. Please contact HR for fresh links.
            </p>
          )}
        </div>

        <h2 className="mt-7 text-xs font-semibold uppercase tracking-wide text-muted">
          Everyone you are rating
        </h2>

        <ul className="mt-3 space-y-3">
          {queue.assignments.map((assignment) => {
            const label = queueStatusLabel(assignment);
            const openable = assignment.status !== "submitted" && !assignment.expired;
            const savedOn = formatDate(assignment.lastSavedAt);

            return (
              <li
                key={assignment.reviewerId}
                className={`rounded-lg border bg-card p-4 shadow-sm ${
                  assignment.isCurrent ? "border-pulse/40 ring-1 ring-pulse/20" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold leading-6">{assignment.subjectName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-muted">{assignment.relationshipLabel}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                      STATUS_TONE[label] ?? "bg-ink/5 text-muted ring-ink/10"
                    }`}
                  >
                    {label}
                  </span>
                </div>

                {assignment.status === "in_progress" && savedOn ? (
                  <p className="mt-2 text-xs leading-5 text-muted">Saved {savedOn}</p>
                ) : null}

                {openable ? (
                  <Link
                    href={`/review/queue/${encodeURIComponent(trimmed)}/open/${assignment.reviewerId}`}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink"
                  >
                    {assignment.status === "in_progress" ? "Resume assessment" : "Start assessment"}
                  </Link>
                ) : assignment.expired ? (
                  <p className="mt-3 text-xs leading-5 text-muted">
                    This link has expired. Contact HR for a replacement.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        {queue.total === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-card p-4 text-sm leading-6 text-muted">
            You have no assessments in this cycle.
          </p>
        ) : null}

        <p className="mt-7 text-xs leading-5 text-muted">
          Your individual ratings are confidential and are never shown to the people you are
          rating. Need help?{" "}
          <Link href="/review/contact" className="font-semibold text-ink underline">
            Contact HR
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
