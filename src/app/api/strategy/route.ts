import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import {
  rollupCascade,
  validateNode,
  type NodeKind,
  type StrategyNode,
} from "@/lib/strategyCascade";

/**
 * The planning cascade.
 *
 * Reading is open to the whole organisation — a strategy nobody can see is not
 * doing its job. Writing is HR's, because these nodes are commitments made on
 * behalf of people who did not personally agree to them; individual goals and
 * KPIs beneath them stay with their owners.
 *
 * Progress is never stored on a node. It is computed from what sits underneath
 * on every read, so there is no second figure to keep in sync and eventually
 * contradict.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type NodeRow = {
  id: string;
  org_id: string;
  parent_id: string | null;
  kind: NodeKind;
  custom_kind_label: string | null;
  title: string;
  description: string | null;
  owner_id: string | null;
  measure: string | null;
  measure_type: string;
  measure_direction: string;
  baseline_value: number | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  strategies: unknown;
  start_date: string | null;
  due_date: string | null;
  weight: number;
  status: string;
  period_label: string | null;
  sort_order: number;
};

const COLUMNS =
  "id, org_id, parent_id, kind, custom_kind_label, title, description, owner_id, measure, measure_type, measure_direction, baseline_value, target_value, current_value, unit, strategies, start_date, due_date, weight, status, period_label, sort_order";

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function context(): Promise<
  | { ok: true; admin: Admin; orgId: string; employeeId: string; isHr: boolean }
  | { ok: false; response: NextResponse }
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

  return {
    ok: true,
    admin,
    orgId: employee.org_id,
    employeeId: employee.id,
    isHr: employee.platform_role === "hr_admin" || employee.platform_role === "super_admin",
  };
}

function toDomain(row: NodeRow): StrategyNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    ownerId: row.owner_id,
    measureType: (row.measure_type as StrategyNode["measureType"]) ?? "number",
    measureDirection: (row.measure_direction as StrategyNode["measureDirection"]) ?? "higher",
    baselineValue: row.baseline_value,
    targetValue: row.target_value,
    currentValue: row.current_value,
    weight: row.weight ?? 0,
    status: row.status,
  };
}

/** The whole tree, with progress rolled up and the attached evidence counted. */
export async function GET() {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, isHr } = ctx;

  const [nodes, goals, kpis, people] = await Promise.all([
    admin.from("strategy_nodes").select(COLUMNS).eq("org_id", orgId).order("sort_order").returns<NodeRow[]>(),
    admin
      .from("goals")
      .select("id, title, owner_id, weight, percent_complete, status, strategy_node_id, appraisal_cycle_id")
      .eq("org_id", orgId)
      .returns<
        Array<{
          id: string;
          title: string;
          owner_id: string | null;
          weight: number | null;
          percent_complete: number | null;
          status: string | null;
          strategy_node_id: string | null;
          appraisal_cycle_id: string | null;
        }>
      >(),
    admin
      .from("kpis")
      .select("id, name, employee_id, weight, measure_direction, baseline_value, target_value, current_value, strategy_node_id")
      .eq("org_id", orgId)
      .returns<
        Array<{
          id: string;
          name: string;
          employee_id: string | null;
          weight: number | null;
          measure_direction: string | null;
          baseline_value: number | null;
          target_value: number | null;
          current_value: number | null;
          strategy_node_id: string | null;
        }>
      >(),
    admin
      .from("employees")
      .select("id, name, email")
      .eq("org_id", orgId)
      .order("name")
      .returns<Array<{ id: string; name: string | null; email: string | null }>>(),
  ]);

  if (nodes.error) {
    // The cascade is additive; an organisation that has not applied the
    // migration should be told, not shown an empty plan that looks deliberate.
    return NextResponse.json(
      {
        error: "The strategy cascade needs the latest database setup. Apply migration 20260910_000002.",
        code: "migration_required",
      },
      { status: 503 },
    );
  }

  if (goals.error || kpis.error || people.error) return NextResponse.json({ error: "Could not load strategy evidence. Retry before relying on progress." }, { status: 503 });
  const domain = (nodes.data ?? []).map(toDomain);
  const rollup = rollupCascade({
    nodes: domain,
    goals: (goals.data ?? []).map((row) => ({
      strategyNodeId: row.strategy_node_id,
      weight: row.weight,
      percentComplete: row.percent_complete,
    })),
    kpis: (kpis.data ?? []).map((row) => ({
      strategyNodeId: row.strategy_node_id,
      weight: row.weight,
      measureDirection: (row.measure_direction as "higher" | "lower") ?? "higher",
      baselineValue: row.baseline_value,
      targetValue: row.target_value,
      currentValue: row.current_value,
    })),
  });

  return NextResponse.json({
    canEdit: isHr,
    people: people.data ?? [],
    nodes: (nodes.data ?? []).map((row) => ({
      ...row,
      strategies: Array.isArray(row.strategies) ? row.strategies : [],
      rollup: rollup.get(row.id) ?? null,
    })),
    goals: goals.data ?? [],
    kpis: kpis.data ?? [],
  });
}

async function parentKindOf(admin: Admin, orgId: string, parentId: string | null): Promise<NodeKind | null> {
  if (!parentId) return null;
  const { data } = await admin
    .from("strategy_nodes")
    .select("kind")
    .eq("id", parentId)
    .eq("org_id", orgId)
    .maybeSingle<{ kind: NodeKind }>();
  return data?.kind ?? null;
}

async function validatePeople(admin: Admin, orgId: string, node: { ownerId: string | null; strategies: Array<{ responsibleId: string | null }> }) {
 const ids = [...new Set([node.ownerId, ...node.strategies.map(a => a.responsibleId)].filter((id): id is string => Boolean(id)))];
 if (!ids.length) return null;
 const { data, error } = await admin.from("employees").select("id").eq("org_id", orgId).in("id", ids);
 return error || data?.length !== ids.length ? "Every accountable and responsible person must belong to your organisation." : null;
}
export async function POST(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, employeeId, isHr } = ctx;

  if (!isHr) {
    return NextResponse.json({ error: "Strategy levels are set by HR." }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;

  if (parentId) {
    const { data: parent } = await admin
      .from("strategy_nodes")
      .select("id")
      .eq("id", parentId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string }>();
    if (!parent) return NextResponse.json({ error: "That parent is not in your organisation." }, { status: 404 });
  }

  const validation = validateNode(body, { parentKind: await parentKindOf(admin, orgId, parentId) });
  if (!validation.ok) {
    return NextResponse.json({ error: "This is not complete yet.", errors: validation.errors }, { status: 422 });
  }
  const node = validation.node;
  if (body.status !== undefined && !["draft","on_track","at_risk","behind","completed"].includes(String(body.status))) return NextResponse.json({ error: "Choose a valid planning status." }, { status: 422 });
  const peopleError = await validatePeople(admin, orgId, node);
  if (peopleError) return NextResponse.json({ error: peopleError }, { status: 422 });

  const { data, error } = await admin
    .from("strategy_nodes")
    .insert({
      org_id: orgId,
      parent_id: node.parentId,
      kind: node.kind,
      custom_kind_label: node.customKindLabel,
      title: node.title,
      description: node.description,
      owner_id: node.ownerId,
      measure: node.measure,
      measure_type: node.measureType,
      measure_direction: node.measureDirection,
      baseline_value: node.baselineValue,
      target_value: node.targetValue,
      current_value: node.currentValue,
      unit: node.unit,
      strategies: node.strategies,
      start_date: node.startDate,
      due_date: node.dueDate,
      weight: node.weight,
      period_label: node.periodLabel,
      created_by: employeeId,
      status: typeof body.status === "string" ? body.status : "on_track",
    })
    .select(COLUMNS)
    .single<NodeRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ node: data, notes: validation.notes }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, isHr } = ctx;

  if (!isHr) return NextResponse.json({ error: "Strategy levels are set by HR." }, { status: 403 });

  const body = (await request.json()) as { id?: string } & Record<string, unknown>;
  if (body.action === "link_goal") {
    if (typeof body.goalId !== "string" || !(body.nodeId === null || typeof body.nodeId === "string")) return NextResponse.json({ error: "Choose a goal and a strategy level." }, { status: 422 });
    if (body.nodeId) {
      const node = await admin.from("strategy_nodes").select("id").eq("id", body.nodeId).eq("org_id", orgId).maybeSingle();
      if (!node.data || node.error) return NextResponse.json({ error: "Strategy level not found." }, { status: 404 });
    }
    const { data, error } = await admin.from("goals").update({ strategy_node_id: body.nodeId }).eq("id", body.goalId).eq("org_id", orgId).is("appraisal_cycle_id", null).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "Could not update this goal link." }, { status: 422 });
    if (!data) return NextResponse.json({ error: "Goal not found or already attached to appraisal. Reload before linking." }, { status: 409 });
    return NextResponse.json({ linked: true });
  }
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });


  const { data: existing } = await admin
    .from("strategy_nodes")
    .select(COLUMNS)
    .eq("id", body.id)
    .eq("org_id", orgId)
    .maybeSingle<NodeRow>();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parentId = body.parentId === undefined ? existing.parent_id : (body.parentId as string | null);

  const validation = validateNode(
    {
      kind: body.kind ?? existing.kind,
      customKindLabel: Object.hasOwn(body, "customKindLabel") ? body.customKindLabel : existing.custom_kind_label,
      title: body.title ?? existing.title,
      description: Object.hasOwn(body, "description") ? body.description : existing.description,
      ownerId: Object.hasOwn(body, "ownerId") ? body.ownerId : existing.owner_id,
      parentId,
      measure: Object.hasOwn(body, "measure") ? body.measure : existing.measure,
      measureType: body.measureType ?? existing.measure_type,
      measureDirection: body.measureDirection ?? existing.measure_direction,
      baselineValue: Object.hasOwn(body, "baselineValue") ? body.baselineValue : existing.baseline_value,
      targetValue: Object.hasOwn(body, "targetValue") ? body.targetValue : existing.target_value,
      currentValue: Object.hasOwn(body, "currentValue") ? body.currentValue : existing.current_value,
      unit: Object.hasOwn(body, "unit") ? body.unit : existing.unit,
      strategies: body.strategies ?? existing.strategies,
      startDate: Object.hasOwn(body, "startDate") ? body.startDate : existing.start_date,
      dueDate: Object.hasOwn(body, "dueDate") ? body.dueDate : existing.due_date,
      weight: body.weight ?? existing.weight,
      periodLabel: Object.hasOwn(body, "periodLabel") ? body.periodLabel : existing.period_label,
    },
    { parentKind: await parentKindOf(admin, orgId, parentId) },
  );

  if (!validation.ok) {
    return NextResponse.json({ error: "This change is not valid.", errors: validation.errors }, { status: 422 });
  }
  const node = validation.node;
  if (body.status !== undefined && !["draft","on_track","at_risk","behind","completed"].includes(String(body.status))) return NextResponse.json({ error: "Choose a valid planning status." }, { status: 422 });
  const peopleError = await validatePeople(admin, orgId, node);
  if (peopleError) return NextResponse.json({ error: peopleError }, { status: 422 });

  const { data, error } = await admin
    .from("strategy_nodes")
    .update({
      parent_id: node.parentId,
      kind: node.kind,
      custom_kind_label: node.customKindLabel,
      title: node.title,
      description: node.description,
      owner_id: node.ownerId,
      measure: node.measure,
      measure_type: node.measureType,
      measure_direction: node.measureDirection,
      baseline_value: node.baselineValue,
      target_value: node.targetValue,
      current_value: node.currentValue,
      unit: node.unit,
      strategies: node.strategies,
      start_date: node.startDate,
      due_date: node.dueDate,
      weight: node.weight,
      period_label: node.periodLabel,
      status: typeof body.status === "string" ? body.status : existing.status,
    })
    .eq("id", existing.id)
    .eq("org_id", orgId)
    .select(COLUMNS)
    .single<NodeRow>();

  // The loop and depth guards live in a database trigger, so a bad parent comes
  // back as an error here rather than being trusted from the request.
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });

  return NextResponse.json({ node: data, notes: validation.notes });
}

/**
 * Removes one node.
 *
 * Children cascade by foreign key, but goals and KPIs beneath it only lose the
 * link — deleting somebody's objectives because a strategy was restructured
 * above them would destroy work that is still theirs.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if (!ctx.ok) return ctx.response;
  const { admin, orgId, isHr } = ctx;

  if (!isHr) return NextResponse.json({ error: "Strategy levels are set by HR." }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin
    .from("strategy_nodes")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string }>();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("strategy_nodes").delete().eq("id", existing.id).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
