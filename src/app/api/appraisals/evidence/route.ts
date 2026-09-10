import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import {
  coverageAfterPlan,
  planEvidenceLinks,
  type EvidenceCycle,
  type LinkableGoal,
  type LinkableKpi,
} from "@/lib/appraisalEvidenceLink";

/**
 * Attaching goals and KPIs to an appraisal cycle.
 *
 * The appraisal engine reads both by `appraisal_cycle_id` and scores them at 35%
 * and 25% respectively. Nothing ever wrote that column, so every appraisal
 * blocked on missing evidence with no way for an administrator to supply it.
 *
 * The decision of what should attach lives in `appraisalEvidenceLink`, tested on
 * its own. This route supplies the rows, enforces who may do it, and writes.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type GoalRow = {
  id: string;
  title: string;
  owner_id: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  cycle: string | null;
  appraisal_cycle_id: string | null;
};

type KpiRow = {
  id: string;
  name: string;
  employee_id: string | null;
  cycle: string | null;
  appraisal_cycle_id: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Authenticates, confirms HR rights, and confirms the cycle is this tenant's.
 *
 * Written out in the handler rather than left to policy: everything below runs
 * with the service-role client, which bypasses RLS, so the org check here is the
 * only thing separating one tenant's objectives from another's.
 */
async function requireCycleAdmin(cycleId: string): Promise<
  | { ok: true; admin: Admin; orgId: string; actorId: string; cycle: EvidenceCycle }
  | { ok: false; response: NextResponse }
> {
  const user = await getRouteUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = getAdminClient();
  const { data: actor } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; platform_role: string | null }>();

  const orgId = actor?.org_id;
  const role = actor?.platform_role;
  if (!orgId || !actor || (role !== "hr_admin" && role !== "super_admin")) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: cycle } = await admin
    .from("appraisal_cycles")
    .select("id, name, start_date, end_date")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; name: string; start_date: string | null; end_date: string | null }>();

  if (!cycle) {
    return { ok: false, response: NextResponse.json({ error: "Appraisal cycle not found" }, { status: 404 }) };
  }

  return {
    ok: true,
    admin,
    orgId,
    actorId: actor.id,
    cycle: { id: cycle.id, name: cycle.name, startDate: cycle.start_date, endDate: cycle.end_date },
  };
}

/** Everything this tenant could attach, plus who is enrolled to attach it to. */
async function loadCandidates(admin: Admin, orgId: string, cycleId: string) {
  const [goals, kpis, participants] = await Promise.all([
    admin
      .from("goals")
      .select("id, title, owner_id, status, start_date, due_date, cycle, appraisal_cycle_id")
      .eq("org_id", orgId)
      .returns<GoalRow[]>(),
    admin
      .from("kpis")
      .select("id, name, employee_id, cycle, appraisal_cycle_id")
      .eq("org_id", orgId)
      .returns<KpiRow[]>(),
    admin
      .from("appraisals")
      .select("employee_id")
      .eq("org_id", orgId)
      .eq("cycle_id", cycleId)
      .returns<Array<{ employee_id: string }>>(),
  ]);

  if (goals.error || kpis.error || participants.error) return null;

  return {
    goals: (goals.data ?? []).map<LinkableGoal>((row) => ({
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      status: row.status,
      startDate: row.start_date,
      dueDate: row.due_date,
      cycleLabel: row.cycle,
      appraisalCycleId: row.appraisal_cycle_id,
    })),
    kpis: (kpis.data ?? []).map<LinkableKpi>((row) => ({
      id: row.id,
      name: row.name,
      employeeId: row.employee_id,
      cycleLabel: row.cycle,
      appraisalCycleId: row.appraisal_cycle_id,
    })),
    participantIds: [...new Set((participants.data ?? []).map((row) => row.employee_id))],
  };
}

/** What would attach, and who would still be left without evidence. */
export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const auth = await requireCycleAdmin(cycleId);
  if (!auth.ok) return auth.response;
  const { admin, orgId, cycle } = auth;

  const candidates = await loadCandidates(admin, orgId, cycle.id);
  if (!candidates) {
    return NextResponse.json({ error: "Could not read goals and KPIs for this organisation." }, { status: 503 });
  }

  const plan = planEvidenceLinks({ cycle, ...candidates });

  return NextResponse.json({
    cycle,
    plan,
    participantCount: candidates.participantIds.length,
    coverage: coverageAfterPlan({
      participantIds: candidates.participantIds,
      goals: candidates.goals,
      kpis: candidates.kpis,
      linkedGoalIds: new Set(plan.goals.link.map((entry) => entry.id)),
      linkedKpiIds: new Set(plan.kpis.link.map((entry) => entry.id)),
      cycleId: cycle.id,
    }),
  });
}

/**
 * Attaches or detaches evidence.
 *
 * `attach` applies the plan, optionally narrowed to specific ids so an
 * administrator can take the matches they agree with. `detach` is the way back
 * out, and the reason the planner never moves evidence between cycles itself.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    cycleId?: string;
    action?: "attach" | "detach";
    goalIds?: string[];
    kpiIds?: string[];
    dryRun?: boolean;
  };

  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const auth = await requireCycleAdmin(body.cycleId);
  if (!auth.ok) return auth.response;
  const { admin, orgId, actorId, cycle } = auth;

  const candidates = await loadCandidates(admin, orgId, cycle.id);
  if (!candidates) {
    return NextResponse.json({ error: "Could not read goals and KPIs for this organisation." }, { status: 503 });
  }

  if (body.action === "detach") {
    const goalIds = body.goalIds ?? [];
    const kpiIds = body.kpiIds ?? [];
    if (!goalIds.length && !kpiIds.length) {
      return NextResponse.json({ error: "Nothing was selected to detach." }, { status: 400 });
    }

    // Scoped to this cycle and this org, so a stray id cannot detach another
    // tenant's evidence or strip a different quarter's attachment.
    const results = await Promise.all([
      goalIds.length
        ? admin.from("goals").update({ appraisal_cycle_id: null }).eq("org_id", orgId).eq("appraisal_cycle_id", cycle.id).in("id", goalIds)
        : Promise.resolve({ error: null }),
      kpiIds.length
        ? admin.from("kpis").update({ appraisal_cycle_id: null }).eq("org_id", orgId).eq("appraisal_cycle_id", cycle.id).in("id", kpiIds)
        : Promise.resolve({ error: null }),
    ]);

    const failure = results.find((result) => result.error);
    if (failure?.error) return NextResponse.json({ error: failure.error.message }, { status: 500 });

    await admin.from("appraisal_events").insert({
      org_id: orgId,
      cycle_id: cycle.id,
      actor_id: actorId,
      action: "evidence_detached",
      payload: { goals: goalIds.length, kpis: kpiIds.length },
    });

    return NextResponse.json({ detached: { goals: goalIds.length, kpis: kpiIds.length } });
  }

  const plan = planEvidenceLinks({ cycle, ...candidates });
  const wantedGoals = body.goalIds ? new Set(body.goalIds) : null;
  const wantedKpis = body.kpiIds ? new Set(body.kpiIds) : null;

  // Only ever a subset of what the planner approved. A caller cannot name an id
  // the rules rejected and have it attached anyway.
  const goalIds = plan.goals.link.filter((entry) => !wantedGoals || wantedGoals.has(entry.id)).map((entry) => entry.id);
  const kpiIds = plan.kpis.link.filter((entry) => !wantedKpis || wantedKpis.has(entry.id)).map((entry) => entry.id);

  if (body.dryRun !== false) {
    return NextResponse.json({ dryRun: true, cycle, plan, wouldAttach: { goals: goalIds.length, kpis: kpiIds.length } });
  }

  if (!goalIds.length && !kpiIds.length) {
    return NextResponse.json({ attached: { goals: 0, kpis: 0 }, plan });
  }

  const results = await Promise.all([
    goalIds.length
      ? admin.from("goals").update({ appraisal_cycle_id: cycle.id }).eq("org_id", orgId).is("appraisal_cycle_id", null).in("id", goalIds)
      : Promise.resolve({ error: null }),
    kpiIds.length
      ? admin.from("kpis").update({ appraisal_cycle_id: cycle.id }).eq("org_id", orgId).is("appraisal_cycle_id", null).in("id", kpiIds)
      : Promise.resolve({ error: null }),
  ]);

  const failure = results.find((result) => result.error);
  if (failure?.error) return NextResponse.json({ error: failure.error.message }, { status: 500 });

  await admin.from("appraisal_events").insert({
    org_id: orgId,
    cycle_id: cycle.id,
    actor_id: actorId,
    action: "evidence_attached",
    payload: { goals: goalIds.length, kpis: kpiIds.length },
  });

  const after = await loadCandidates(admin, orgId, cycle.id);

  return NextResponse.json({
    attached: { goals: goalIds.length, kpis: kpiIds.length },
    coverage: after
      ? coverageAfterPlan({
          participantIds: after.participantIds,
          goals: after.goals,
          kpis: after.kpis,
          linkedGoalIds: new Set<string>(),
          linkedKpiIds: new Set<string>(),
          cycleId: cycle.id,
        })
      : [],
  }, { status: 201 });
}
