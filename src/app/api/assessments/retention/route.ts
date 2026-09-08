import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  DEFAULT_RETENTION_DAYS,
  buildDeletionCertificate,
  isCycleDueForPurge,
  parseRetentionConfig,
  withRetentionConfig,
} from "@/lib/assessmentRetention";
import { canManageAssessmentCycle } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = SupabaseClient;
type Caller = { userId: string; employeeId: string; orgId: string; role: string };
type CycleRow = {
  id: string;
  org_id: string;
  name: string;
  client_context: string | null;
  closes_on: string | null;
};

const purgeTables = [
  "assessment_responses",
  "assessment_self_assessments",
  "assessment_nominations",
  "assessment_reports",
  "assessment_reviewers",
  "assessment_items",
  "assessment_competencies",
] as const;

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getCaller(): Promise<
  { caller: Caller; admin: Admin; error: null } | { caller: null; admin: Admin; error: NextResponse }
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
  const admin = getAdminClient();
  if (!user) return { caller: null, admin, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; platform_role: string | null }>();

  if (!employee?.org_id || !employee.platform_role || !canManageAssessmentCycle(employee.platform_role)) {
    return { caller: null, admin, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    caller: { userId: user.id, employeeId: employee.id, orgId: employee.org_id, role: employee.platform_role },
    admin,
    error: null,
  };
}

async function loadCycle(admin: Admin, cycleId: string, orgId?: string | null) {
  let query = admin
    .from("assessment_cycles")
    .select("id, org_id, name, client_context, closes_on")
    .eq("id", cycleId);
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query.maybeSingle<CycleRow>();
  return data;
}

async function countRows(admin: Admin, table: string, cycleId: string) {
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
  return count ?? 0;
}

async function purgeCycleData(admin: Admin, cycle: CycleRow, reason: "manual" | "scheduled") {
  const retentionDays = parseRetentionConfig(cycle.client_context).retentionDays;
  const counts: Record<string, number> = {};
  for (const table of purgeTables) {
    counts[table] = await countRows(admin, table, cycle.id);
  }

  const certificate = buildDeletionCertificate({
    cycleId: cycle.id,
    retentionDays,
    reason,
    counts,
  });

  await admin.from("assessment_audit_events").insert({
    cycle_id: cycle.id,
    action: "assessment_cycle_purged",
    metadata: {
      certificate,
      cycleName: cycle.name,
      purgeMode: reason,
    },
  });

  for (const table of purgeTables) {
    const { error } = await admin.from(table).delete().eq("cycle_id", cycle.id);
    if (error) throw new Error(`Failed to purge ${table}: ${error.message}`);
  }

  await admin.from("assessment_cycles").update({ status: "closed" }).eq("id", cycle.id);
  return certificate;
}

function scheduledAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId required" }, { status: 400 });

  const { caller, admin, error } = await getCaller();
  if (!caller) return error;
  const cycle = await loadCycle(admin, cycleId, caller.orgId);
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const config = parseRetentionConfig(cycle.client_context);
  return NextResponse.json({
    cycleId,
    retentionDays: config.retentionDays,
    dueForPurge: isCycleDueForPurge({ closesOn: cycle.closes_on, clientContext: cycle.client_context }),
  });
}

export async function PATCH(request: NextRequest) {
  const { caller, admin, error } = await getCaller();
  if (!caller) return error;
  const body = (await request.json()) as { cycleId?: string; retentionDays?: number };
  if (!body.cycleId || !body.retentionDays) {
    return NextResponse.json({ error: "cycleId and retentionDays required" }, { status: 400 });
  }

  const cycle = await loadCycle(admin, body.cycleId, caller.orgId);
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const clientContext = withRetentionConfig(cycle.client_context, body.retentionDays);
  const { error: updateError } = await admin
    .from("assessment_cycles")
    .update({ client_context: clientContext })
    .eq("id", cycle.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.from("assessment_audit_events").insert({
    cycle_id: cycle.id,
    action: "assessment_retention_configured",
    metadata: {
      actorUserId: caller.userId,
      actorEmployeeId: caller.employeeId,
      actorRole: caller.role,
      retentionDays: Math.max(1, Math.floor(body.retentionDays)),
    },
  });

  return NextResponse.json({ cycleId: cycle.id, retentionDays: Math.max(1, Math.floor(body.retentionDays)) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { cycleId?: string; mode?: "manual" | "scheduled"; fallbackDays?: number };
  const mode = body.mode ?? (body.cycleId ? "manual" : "scheduled");
  const admin = getAdminClient();

  if (mode === "scheduled") {
    if (!scheduledAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: cycles, error } = await admin
      .from("assessment_cycles")
      .select("id, org_id, name, client_context, closes_on")
      .not("closes_on", "is", null)
      .returns<CycleRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const purged = [];
    for (const cycle of cycles ?? []) {
      if (!isCycleDueForPurge({
        closesOn: cycle.closes_on,
        clientContext: cycle.client_context,
        fallbackDays: body.fallbackDays ?? DEFAULT_RETENTION_DAYS,
      })) continue;
      purged.push(await purgeCycleData(admin, cycle, "scheduled"));
    }

    return NextResponse.json({ purged, count: purged.length });
  }

  const { caller, admin: authedAdmin, error } = await getCaller();
  if (!caller) return error;
  if (!body.cycleId) return NextResponse.json({ error: "cycleId required" }, { status: 400 });

  const cycle = await loadCycle(authedAdmin, body.cycleId, caller.orgId);
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const certificate = await purgeCycleData(authedAdmin, cycle, "manual");
  return NextResponse.json({ certificate });
}
