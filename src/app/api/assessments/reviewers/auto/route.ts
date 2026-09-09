import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

import {
  buildAutoRaterPlan,
  isOrgTier,
  type AutoRaterPlan,
  type OrgTier,
  type RosterMember,
} from "@/lib/raterAutoAssign";

/**
 * Assigning raters from the organisation chart.
 *
 * Self and line manager come from the chart with no input at all, colleagues and
 * direct reports are chosen by the rules in raterAutoAssign, and the only people
 * left for HR to enter by hand are the external ones — customers — who by
 * definition are not on the chart.
 *
 * Nothing here sends email. Assignments are created with invitations unissued,
 * so a plan can be reviewed and corrected before anybody is contacted; issuing
 * invites stays the separate, deliberate step it already was.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type CycleRules = {
  id: string;
  min_responses_per_group: number | null;
  suppression_mode: string | null;
  rater_quota: { colleague?: number; direct_report?: number } | null;
  rater_rules_locked_at: string | null;
};

async function requireCycleAdmin(cycleId: string): Promise<
  | { ok: true; admin: Admin; orgId: string; userId: string; cycle: CycleRules }
  | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ org_id: string | null; platform_role: string | null }>();

  const orgId = employee?.org_id;
  const role = employee?.platform_role;
  if (!orgId || (role !== "hr_admin" && role !== "super_admin")) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id, min_responses_per_group, suppression_mode, rater_quota, rater_rules_locked_at")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle<CycleRules>();

  if (!cycle) {
    return { ok: false, response: NextResponse.json({ error: "Cycle not found" }, { status: 404 }) };
  }

  return { ok: true, admin, orgId, userId: user.id, cycle };
}

/** The roster, shaped for the planner. */
async function loadRoster(admin: Admin, orgId: string): Promise<RosterMember[]> {
  const { data } = await admin
    .from("employees")
    .select("id, name, email, people_responsibility, department, team, line_manager_id")
    .eq("org_id", orgId)
    .returns<
      Array<{
        id: string;
        name: string | null;
        email: string | null;
        people_responsibility: string | null;
        department: string | null;
        team: string | null;
        line_manager_id: string | null;
      }>
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "Unnamed",
    email: row.email,
    tier: (isOrgTier(row.people_responsibility) ? row.people_responsibility : "none") as OrgTier,
    department: row.department,
    team: row.team,
    lineManagerId: row.line_manager_id,
  }));
}

/**
 * Plans raters for every participant in the cycle, then optionally creates them.
 *
 * A dry run is the default posture of the console: the plan, its shortfalls and
 * the groups that will pool or be hidden are all visible before a single row is
 * written.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    cycleId?: string;
    subjectIds?: string[];
    dryRun?: boolean;
  };

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const auth = await requireCycleAdmin(body.cycleId);
  if (!auth.ok) return auth.response;
  const { admin, orgId, userId, cycle } = auth;

  const [roster, { data: subjects, error: subjectsError }, { data: existingRaters }] = await Promise.all([
    loadRoster(admin, orgId),
    admin
      .from("assessment_subjects")
      .select("id, employee_id, name, email")
      .eq("cycle_id", body.cycleId)
      .is("withdrawn_at", null)
      .returns<Array<{ id: string; employee_id: string | null; name: string; email: string | null }>>(),
    admin
      .from("assessment_reviewers")
      .select("subject_id, reviewer_email, reviewer_group")
      .eq("cycle_id", body.cycleId)
      .returns<Array<{ subject_id: string; reviewer_email: string; reviewer_group: string }>>(),
  ]);

  if (subjectsError) return NextResponse.json({ error: subjectsError.message }, { status: 500 });

  const rosterById = new Map(roster.map((member) => [member.id, member]));
  const wanted = body.subjectIds?.length ? new Set(body.subjectIds) : null;

  // Existing assignments are matched on subject + email + group, the same key
  // the reviewers table is unique on, so re-running adds only what is missing
  // rather than duplicating a rater who is already assigned.
  const already = new Set(
    (existingRaters ?? []).map((row) => `${row.subject_id}|${row.reviewer_email.toLowerCase()}|${row.reviewer_group}`),
  );

  const minimum = cycle.min_responses_per_group ?? 3;
  const mode = cycle.suppression_mode === "suppress" ? "suppress" : "merge";

  const plans: Array<{
    subjectId: string;
    subjectName: string;
    unlinked: boolean;
    plan: AutoRaterPlan | null;
    newRaters: Array<{ name: string; email: string; group: string; rationale: string }>;
    shortfalls: AutoRaterPlan["shortfalls"];
  }> = [];

  const rowsToInsert: Array<Record<string, unknown>> = [];

  for (const subject of subjects ?? []) {
    if (wanted && !wanted.has(subject.id)) continue;

    const member = subject.employee_id ? rosterById.get(subject.employee_id) : undefined;

    if (!member) {
      // Without an employee record there is no position on the chart, so no
      // manager, no peers and no reports can be derived. Said plainly rather
      // than returning an empty plan that looks like "nobody available".
      plans.push({
        subjectId: subject.id,
        subjectName: subject.name,
        unlinked: true,
        plan: null,
        newRaters: [],
        shortfalls: [
          {
            group: "colleague",
            wanted: 0,
            found: 0,
            message:
              "This participant is not linked to an employee record, so they have no position on the organisation chart and no raters can be derived. Add them to the staff list, then remove and re-add them here.",
          },
        ],
      });
      continue;
    }

    const plan = buildAutoRaterPlan(member, roster, {
      quota: {
        colleague: cycle.rater_quota?.colleague ?? 3,
        direct_report: cycle.rater_quota?.direct_report ?? 3,
      },
      minimumPerGroup: minimum,
      suppressionMode: mode,
    });

    const newRaters = plan.raters.filter(
      (rater) => !already.has(`${subject.id}|${rater.email.toLowerCase()}|${rater.group}`),
    );

    for (const rater of newRaters) {
      const token = createInviteToken();
      rowsToInsert.push({
        cycle_id: body.cycleId,
        subject_id: subject.id,
        reviewer_name: rater.name,
        reviewer_email: rater.email,
        reviewer_group: rater.group,
        reviewer_employee_id: rater.employeeId,
        token_hash: hashToken(token),
        token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString(),
        // Created unissued. Nothing is emailed until somebody chooses to.
        invite_status: "draft",
        invite_channel: "email",
        assessment_scope: "individual",
        status: "not_started",
      });
    }

    plans.push({
      subjectId: subject.id,
      subjectName: subject.name,
      unlinked: false,
      plan,
      newRaters: newRaters.map((rater) => ({
        name: rater.name,
        email: rater.email,
        group: rater.group,
        rationale: rater.rationale,
      })),
      shortfalls: plan.shortfalls,
    });
  }

  if (body.dryRun !== false) {
    return NextResponse.json({
      dryRun: true,
      rules: { minimumPerGroup: minimum, suppressionMode: mode, quota: cycle.rater_quota },
      rulesLocked: Boolean(cycle.rater_rules_locked_at),
      plans,
      totalNewRaters: rowsToInsert.length,
    });
  }

  if (!rowsToInsert.length) {
    return NextResponse.json({ created: 0, plans });
  }

  const { data: created, error } = await admin
    .from("assessment_reviewers")
    .insert(rowsToInsert)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("assessment_audit_events").insert({
    cycle_id: body.cycleId,
    action: "assessment_raters_auto_assigned",
    metadata: {
      actorId: userId,
      created: created?.length ?? 0,
      minimumPerGroup: minimum,
      suppressionMode: mode,
      subjectsPlanned: plans.length,
    },
  });

  return NextResponse.json({ created: created?.length ?? 0, plans }, { status: 201 });
}
