import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import {
  canCreateGoal,
  canEditGoal,
  validateGoal,
  weightSummary,
  type Actor,
  type GoalType,
} from "@/lib/goalRules";

/**
 * Creating and maintaining goals.
 *
 * There was no goals API at all. Objectives could be attached to an appraisal
 * cycle and scored at 35% of the total, but never authored — the page at
 * /goals rendered a demo company's objectives from a fixture. Every appraisal
 * therefore blocked on evidence that no part of the product could produce.
 *
 * Who may do what lives in `goalRules`, tested on its own. This route
 * establishes who is asking, supplies the rows, and writes. The checks are
 * repeated in the handler rather than left to policy because everything below
 * reads and writes with the service-role client, which bypasses RLS.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type GoalRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  goal_type: string;
  department: string | null;
  team: string | null;
  target_metric: string | null;
  weight: number | null;
  percent_complete: number | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  cycle: string | null;
  appraisal_cycle_id: string | null;
  updated_at: string | null;
};

const COLUMNS =
  "id, org_id, owner_id, created_by, title, description, goal_type, department, team, target_metric, weight, percent_complete, status, start_date, due_date, cycle, appraisal_cycle_id, updated_at";

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** The caller, plus the reports that decide what they may author for others. */
async function context(): Promise<
  { ok: true; admin: Admin; orgId: string; actor: Actor } | { ok: false; response: NextResponse }
> {
  const user = await getRouteUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; platform_role: string | null }>();

  if (!employee?.org_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your account is not linked to an organisation." }, { status: 403 }),
    };
  }

  const { data: reports } = await admin
    .from("employees")
    .select("id")
    .eq("org_id", employee.org_id)
    .eq("line_manager_id", employee.id)
    .returns<Array<{ id: string }>>();

  return {
    ok: true,
    admin,
    orgId: employee.org_id,
    actor: {
      employeeId: employee.id,
      role: employee.platform_role,
      directReportIds: (reports ?? []).map((row) => row.id),
    },
  };
}

/**
 * Goals this organisation holds, with the caller's authoring rights on each.
 *
 * Everyone in an organisation can see its goals — that is what the existing
 * read policy says and what makes shared objectives useful. What differs by
 * caller is what they may change, so each row carries that answer rather than
 * leaving the page to guess and offer a button that fails.
 */
export async function GET(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const ownerFilter = request.nextUrl.searchParams.get("ownerId");

  const [{ data: goals, error }, { data: people }] = await Promise.all([
    admin
      .from("goals")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .order("due_date", { ascending: true })
      .returns<GoalRow[]>(),
    admin
      .from("employees")
      .select("id, name, email, department, team")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; name: string | null; email: string | null; department: string | null; team: string | null }>>(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (goals ?? []).filter((row) => !ownerFilter || row.owner_id === ownerFilter);

  return NextResponse.json({
    viewer: {
      employeeId: actor.employeeId,
      role: actor.role,
      directReportIds: actor.directReportIds,
      canCreateOrgGoals: canCreateGoal(actor, { ownerId: actor.employeeId, goalType: "org" }),
    },
    people: people ?? [],
    goals: rows.map((row) => ({
      ...row,
      editable: canEditGoal(actor, {
        ownerId: row.owner_id,
        goalType: (row.goal_type as GoalType) ?? "individual",
        appraisalCycleId: row.appraisal_cycle_id,
      }),
    })),
    weightByOwner: Object.fromEntries(
      [...new Set((goals ?? []).map((row) => row.owner_id).filter(Boolean) as string[])].map((ownerId) => [
        ownerId,
        weightSummary(
          (goals ?? []).map((row) => ({ ownerId: row.owner_id, weight: row.weight ?? 0 })),
          ownerId,
        ),
      ]),
    ),
  });
}

/** Creates one goal. */
export async function POST(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const body = await request.json();
  const validation = validateGoal(body);
  if (!validation.ok) {
    return NextResponse.json({ error: "This goal is not complete yet.", errors: validation.errors }, { status: 422 });
  }
  const goal = validation.goal;

  if (!canCreateGoal(actor, { ownerId: goal.ownerId, goalType: goal.goalType })) {
    return NextResponse.json(
      {
        error:
          goal.goalType === "org" || goal.goalType === "dept"
            ? "Organisation and department goals are set by HR."
            : "You can only set goals for yourself or for the people who report to you.",
      },
      { status: 403 },
    );
  }

  // The owner must be in the caller's own organisation. Nothing below is
  // protected by policy, so this is the tenant boundary.
  const { data: owner } = await admin
    .from("employees")
    .select("id, department, team")
    .eq("id", goal.ownerId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; department: string | null; team: string | null }>();

  if (!owner) {
    return NextResponse.json({ error: "That owner is not in your organisation." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("goals")
    .insert({
      org_id: orgId,
      owner_id: goal.ownerId,
      created_by: actor.employeeId,
      title: goal.title,
      description: goal.description,
      goal_type: goal.goalType,
      department: goal.department ?? owner.department,
      team: goal.team ?? owner.team,
      target_metric: goal.targetMetric,
      weight: goal.weight,
      percent_complete: goal.percentComplete,
      status: goal.status,
      start_date: goal.startDate,
      due_date: goal.dueDate,
      cycle: goal.cycle,
    })
    .select(COLUMNS)
    .single<GoalRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goal: data }, { status: 201 });
}

/** Updates one goal, most often just its progress. */
export async function PATCH(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const body = (await request.json()) as { id?: string } & Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin
    .from("goals")
    .select(COLUMNS)
    .eq("id", body.id)
    .eq("org_id", orgId)
    .maybeSingle<GoalRow>();

  if (!existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const decision = canEditGoal(actor, {
    ownerId: existing.owner_id,
    goalType: (existing.goal_type as GoalType) ?? "individual",
    appraisalCycleId: existing.appraisal_cycle_id,
  });

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason ?? "You cannot change this goal." }, { status: 403 });
  }

  // Validated as a whole rather than field by field, so a partial edit cannot
  // leave a goal in a shape the appraisal engine will not accept.
  const validation = validateGoal({
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    goalType: body.goalType ?? existing.goal_type,
    ownerId: body.ownerId ?? existing.owner_id,
    weight: body.weight ?? existing.weight ?? 0,
    percentComplete: body.percentComplete ?? existing.percent_complete ?? 0,
    startDate: body.startDate ?? existing.start_date,
    dueDate: body.dueDate ?? existing.due_date,
    // Omitted so the status is re-derived from the new progress unless the
    // caller states one; a stale "on track" is the one an appraisal quotes back.
    status: body.status,
    targetMetric: body.targetMetric ?? existing.target_metric,
    department: body.department ?? existing.department,
    team: body.team ?? existing.team,
    cycle: body.cycle ?? existing.cycle,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: "This change is not valid.", errors: validation.errors }, { status: 422 });
  }
  const goal = validation.goal;

  if (goal.ownerId !== existing.owner_id && !canCreateGoal(actor, { ownerId: goal.ownerId, goalType: goal.goalType })) {
    return NextResponse.json({ error: "You cannot reassign this goal to that owner." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("goals")
    .update({
      owner_id: goal.ownerId,
      title: goal.title,
      description: goal.description,
      goal_type: goal.goalType,
      department: goal.department,
      team: goal.team,
      target_metric: goal.targetMetric,
      weight: goal.weight,
      percent_complete: goal.percentComplete,
      status: goal.status,
      start_date: goal.startDate,
      due_date: goal.dueDate,
      cycle: goal.cycle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("org_id", orgId)
    // Refuses if the goal was attached to a cycle between the check and the
    // write, rather than editing a figure that has just been scored.
    .is("appraisal_cycle_id", null)
    .select(COLUMNS)
    .maybeSingle<GoalRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "This goal was attached to an appraisal cycle while you were editing it. Reload to see it." },
      { status: 409 },
    );
  }

  return NextResponse.json({ goal: data });
}

/** Deletes one goal. Only ever a goal nothing has scored. */
export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin
    .from("goals")
    .select(COLUMNS)
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle<GoalRow>();

  if (!existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const decision = canEditGoal(actor, {
    ownerId: existing.owner_id,
    goalType: (existing.goal_type as GoalType) ?? "individual",
    appraisalCycleId: existing.appraisal_cycle_id,
  });

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason ?? "You cannot delete this goal." }, { status: 403 });
  }

  const { error } = await admin
    .from("goals")
    .delete()
    .eq("id", existing.id)
    .eq("org_id", orgId)
    .is("appraisal_cycle_id", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
