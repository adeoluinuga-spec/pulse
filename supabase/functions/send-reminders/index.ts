import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PULSE_EDGE_SECRET = Deno.env.get("PULSE_EDGE_SECRET") ?? "";
const REMINDER_DAYS = [3, 7, 10, 12];

serve(async (req) => {
  if (!PULSE_EDGE_SECRET || req.headers.get("x-pulse-secret") !== PULSE_EDGE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Date.now();
  // Scoped to cycles that are actually collecting. Without the join this
  // selected every unsubmitted reviewer in the database, so a cycle in setup, a
  // closed cycle, or another tenant's cycle would all be chased on the same
  // schedule. The cron has no cycle argument, so the cycle's own status is what
  // decides whether its raters should be hearing from us at all.
  const { data: reviewerRows, error: reviewerError } = await admin
    .from("assessment_reviewers")
    .select(
      "id, reviewer_email, reviewer_name, created_at, token_expires_at, status, subject_id, assessment_cycles!inner(id, name, status, closes_on)",
    )
    .neq("status", "submitted")
    .not("token_expires_at", "is", null)
    .gt("token_expires_at", new Date().toISOString())
    .eq("assessment_cycles.status", "collecting");

  if (reviewerError) {
    return new Response(JSON.stringify({ error: reviewerError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subjectIds = Array.from(new Set((reviewerRows ?? []).map((row) => row.subject_id).filter(Boolean))) as string[];
  let subjectMap = new Map<string, string>();

  if (subjectIds.length > 0) {
    const { data: subjects } = await admin
      .from("assessment_subjects")
      .select("id, name")
      .in("id", subjectIds);

    subjectMap = new Map((subjects ?? []).map((subject) => [subject.id, subject.name]));
  }

  const results: Array<{ email: string; status: string; subject: string; daysSinceIssue: number }> = [];

  for (const row of reviewerRows ?? []) {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : null;
    if (!createdAt) continue;

    // Never chase a rater once the window has shut — their submission would be
    // refused anyway, so the reminder would only be an apology waiting to happen.
    const closesOn = (row as { assessment_cycles?: { closes_on?: string | null } }).assessment_cycles?.closes_on;
    if (closesOn && new Date(closesOn).getTime() < now) continue;

    const elapsedDays = Math.round((now - createdAt) / (1000 * 60 * 60 * 24));
    if (!REMINDER_DAYS.includes(elapsedDays)) continue;

    const subjectName = subjectMap.get(row.subject_id) ?? "this assessment";
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).toLocaleString() : "the current cycle";
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "x-pulse-secret": PULSE_EDGE_SECRET,
      },
      body: JSON.stringify({
        type: "assessment_reminder",
        recipientEmail: row.reviewer_email,
        recipientName: row.reviewer_name || "there",
        data: {
          subjectName,
          expiresAt,
          assessmentUrl: `${Deno.env.get("APP_URL") ?? "https://usepulse.app"}/review/contact`,
        },
      }),
    });

    results.push({
      email: row.reviewer_email,
      status: emailRes.ok ? "sent" : "error",
      subject: subjectName,
      daysSinceIssue: elapsedDays,
    });
  }

  return new Response(
    JSON.stringify({ reminded: results.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
