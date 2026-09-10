import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import { canCreateGoal, canEditGoal, type Actor } from "@/lib/goalRules";
import { trendFor, validateKpi } from "@/lib/kpiRules";

/**
 * Creating and maintaining KPIs.
 *
 * The other half of the appraisal evidence that could be scored but never
 * authored. Ownership follows exactly the same rule as goals — people maintain
 * their own measures, managers their reports', HR anyone's — so the decision is
 * reused from `goalRules` rather than restated here and allowed to drift.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type KpiRow = {
  id: string;
  org_id: string;
  employee_id: string | null;
  strategy_node_id: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  weight: number | null;
  trend: string | null;
  measure_direction: string | null;
  frequency: string | null;
  cycle: string | null;
  is_active: boolean | null;
  appraisal_cycle_id: string | null;
};

const COLUMNS =
  "id, org_id, employee_id, strategy_node_id, name, description, unit, baseline_value, target_value, current_value, weight, trend, measure_direction, frequency, cycle, is_active, appraisal_cycle_id";

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function context(): Promise<
  { ok: true; admin: Admin; orgId: string; actor: Actor } | { ok: false; response: NextResponse }
> {
  const user = await getRouteUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

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

/** A KPI's editing rights, reusing the goal rule so the two cannot diverge. */
function rights(actor: Actor, row: KpiRow) {
  return canEditGoal(actor, {
    ownerId: row.employee_id,
    goalType: "individual",
    appraisalCycleId: row.appraisal_cycle_id,
  });
}

export async function GET(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const nodeFilter = request.nextUrl.searchParams.get("strategyNodeId");

  const [{ data: kpis, error }, { data: people }] = await Promise.all([
    admin.from("kpis").select(COLUMNS).eq("org_id", orgId).order("name").returns<KpiRow[]>(),
    admin
      .from("employees")
      .select("id, name, email")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; name: string | null; email: string | null }>>(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (kpis ?? []).filter((row) => !nodeFilter || row.strategy_node_id === nodeFilter);

  return NextResponse.json({
    viewer: { employeeId: actor.employeeId, role: actor.role, directReportIds: actor.directReportIds },
    people: people ?? [],
    kpis: rows.map((row) => ({ ...row, editable: rights(actor, row) })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const validation = validateKpi(await request.json());
  if (!validation.ok) {
    return NextResponse.json({ error: "This KPI is not complete yet.", errors: validation.errors }, { status: 422 });
  }
  const kpi = validation.kpi;

  if (!canCreateGoal(actor, { ownerId: kpi.employeeId, goalType: "individual" })) {
    return NextResponse.json(
      { error: "You can only set KPIs for yourself or for the people who report to you." },
      { status: 403 },
    );
  }

  // Both the owner and any strategy node must belong to this tenant. Nothing
  // below is protected by policy — this route writes with the service-role client.
  const { data: owner } = await admin
    .from("employees")
    .select("id")
    .eq("id", kpi.employeeId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string }>();

  if (!owner) return NextResponse.json({ error: "That owner is not in your organisation." }, { status: 404 });

  if (kpi.strategyNodeId) {
    const { data: node } = await admin
      .from("strategy_nodes")
      .select("id")
      .eq("id", kpi.strategyNodeId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string }>();
    if (!node) return NextResponse.json({ error: "That strategy node is not in your organisation." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("kpis")
    .insert({
      org_id: orgId,
      employee_id: kpi.employeeId,
      strategy_node_id: kpi.strategyNodeId,
      name: kpi.name,
      description: kpi.description,
      unit: kpi.unit,
      baseline_value: kpi.baselineValue,
      target_value: kpi.targetValue,
      current_value: kpi.currentValue,
      weight: kpi.weight,
      measure_direction: kpi.measureDirection,
      frequency: kpi.frequency,
      cycle: kpi.cycle,
      is_active: kpi.isActive,
      trend: "flat",
    })
    .select(COLUMNS)
    .single<KpiRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ kpi: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const body = (await request.json()) as { id?: string } & Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin
    .from("kpis")
    .select(COLUMNS)
    .eq("id", body.id)
    .eq("org_id", orgId)
    .maybeSingle<KpiRow>();

  if (!existing) return NextResponse.json({ error: "KPI not found" }, { status: 404 });

  const decision = rights(actor, existing);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason ?? "You cannot change this KPI." }, { status: 403 });
  }

  const validation = validateKpi({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    employeeId: body.employeeId ?? existing.employee_id,
    strategyNodeId: body.strategyNodeId ?? existing.strategy_node_id,
    unit: body.unit ?? existing.unit,
    baselineValue: body.baselineValue ?? existing.baseline_value,
    targetValue: body.targetValue ?? existing.target_value,
    currentValue: body.currentValue ?? existing.current_value,
    weight: body.weight ?? existing.weight ?? 0,
    measureDirection: body.measureDirection ?? existing.measure_direction ?? "higher",
    frequency: body.frequency ?? existing.frequency ?? "monthly",
    cycle: body.cycle ?? existing.cycle,
    isActive: body.isActive ?? existing.is_active ?? true,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: "This change is not valid.", errors: validation.errors }, { status: 422 });
  }
  const kpi = validation.kpi;

  const { data, error } = await admin
    .from("kpis")
    .update({
      employee_id: kpi.employeeId,
      strategy_node_id: kpi.strategyNodeId,
      name: kpi.name,
      description: kpi.description,
      unit: kpi.unit,
      baseline_value: kpi.baselineValue,
      target_value: kpi.targetValue,
      current_value: kpi.currentValue,
      weight: kpi.weight,
      measure_direction: kpi.measureDirection,
      frequency: kpi.frequency,
      cycle: kpi.cycle,
      is_active: kpi.isActive,
      // The previous reading is not kept anywhere, so the direction of travel
      // can only be recorded at the moment it changes.
      trend: trendFor({
        previous: existing.current_value,
        next: kpi.currentValue,
        direction: kpi.measureDirection,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("org_id", orgId)
    .is("appraisal_cycle_id", null)
    .select(COLUMNS)
    .maybeSingle<KpiRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "This KPI was attached to an appraisal cycle while you were editing it. Reload to see it." },
      { status: 409 },
    );
  }

  return NextResponse.json({ kpi: data });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, actor } = ctx;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin
    .from("kpis")
    .select(COLUMNS)
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle<KpiRow>();

  if (!existing) return NextResponse.json({ error: "KPI not found" }, { status: 404 });

  const decision = rights(actor, existing);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason ?? "You cannot delete this KPI." }, { status: 403 });
  }

  const { error } = await admin.from("kpis").delete().eq("id", existing.id).eq("org_id", orgId).is("appraisal_cycle_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
