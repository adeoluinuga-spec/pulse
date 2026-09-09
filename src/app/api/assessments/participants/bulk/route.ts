import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  cohortFeasibility,
  isOrgTier,
  ORG_TIERS,
  TIER_LABEL,
  TIER_TO_SUBJECT_LEVEL,
  type OrgTier,
} from "@/lib/raterAutoAssign";

/**
 * Adding everyone at one level of the organisation chart as participants.
 *
 * Adding participants one at a time was where the employee link most often went
 * missing — and an unlinked participant can never open their own report, which
 * only shows up on release day. Selecting from the roster means the link is the
 * starting point rather than a lookup that might fail.
 *
 * `people_responsibility` is the tier, because it is what the published chart
 * stamps. The `cadre` column also exists but holds free text entered by hand,
 * and is not a hierarchy anything can be selected by.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
  people_responsibility: string | null;
  department: string | null;
  team: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireCycleAdmin(cycleId: string): Promise<
  | { ok: true; admin: Admin; orgId: string; userId: string; minimum: number }
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

  // The tenant boundary. Everything past this point uses the service-role
  // client, so no policy is protecting these rows.
  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id, min_responses_per_group")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; min_responses_per_group: number | null }>();

  if (!cycle) {
    return { ok: false, response: NextResponse.json({ error: "Cycle not found" }, { status: 404 }) };
  }

  return { ok: true, admin, orgId, userId: user.id, minimum: cycle.min_responses_per_group ?? 3 };
}

function tierOf(row: EmployeeRow): OrgTier {
  return isOrgTier(row.people_responsibility) ? row.people_responsibility : "none";
}

/**
 * Who is at each level, and who is already a participant.
 *
 * The GET exists so the console can show real counts before anything is
 * created — including the honest verdict on whether this organisation is large
 * enough for anonymous feedback at all.
 */
export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const auth = await requireCycleAdmin(cycleId);
  if (!auth.ok) return auth.response;
  const { admin, orgId, minimum } = auth;

  const [{ data: employees }, { data: existing }] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, email, people_responsibility, department, team")
      .eq("org_id", orgId)
      .returns<EmployeeRow[]>(),
    admin
      .from("assessment_subjects")
      .select("employee_id, email")
      .eq("cycle_id", cycleId)
      .returns<Array<{ employee_id: string | null; email: string | null }>>(),
  ]);

  const roster = employees ?? [];
  const alreadyIn = new Set((existing ?? []).map((row) => row.employee_id).filter(Boolean) as string[]);

  const levels = ORG_TIERS.map((tier) => {
    const members = roster.filter((row) => tierOf(row) === tier);
    return {
      tier,
      label: TIER_LABEL[tier],
      total: members.length,
      alreadyParticipants: members.filter((row) => alreadyIn.has(row.id)).length,
      missingEmail: members.filter((row) => !row.email?.trim()).length,
      members: members.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        alreadyParticipant: alreadyIn.has(row.id),
      })),
    };
  }).filter((level) => level.total > 0);

  return NextResponse.json({
    levels,
    rosterSize: roster.length,
    feasibility: cohortFeasibility({ rosterSize: roster.length, minimumPerGroup: minimum }),
  });
}

/**
 * Adds every employee at the given levels as a participant.
 *
 * Idempotent by employee: somebody already in the cycle is reported as skipped
 * rather than inserted twice or failing the whole batch on a unique violation.
 * Anybody without an email is skipped too — a participant with no address can
 * never be told they are being assessed, and cannot hold a self-assessment.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cycleId?: string; tiers?: unknown; dryRun?: boolean };

  if (!body.cycleId || !Array.isArray(body.tiers) || !body.tiers.length) {
    return NextResponse.json({ error: "cycleId and at least one tier are required" }, { status: 400 });
  }

  const tiers = body.tiers.filter(isOrgTier);
  if (!tiers.length) {
    return NextResponse.json({ error: "No recognised organisation levels were given" }, { status: 400 });
  }

  const auth = await requireCycleAdmin(body.cycleId);
  if (!auth.ok) return auth.response;
  const { admin, orgId, userId } = auth;

  const [{ data: employees, error: employeesError }, { data: existing }] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, email, people_responsibility, department, team")
      .eq("org_id", orgId)
      .returns<EmployeeRow[]>(),
    admin
      .from("assessment_subjects")
      .select("employee_id")
      .eq("cycle_id", body.cycleId)
      .returns<Array<{ employee_id: string | null }>>(),
  ]);

  if (employeesError) {
    return NextResponse.json({ error: employeesError.message }, { status: 500 });
  }

  const alreadyIn = new Set((existing ?? []).map((row) => row.employee_id).filter(Boolean) as string[]);
  const selected = (employees ?? []).filter((row) => tiers.includes(tierOf(row)));

  const skipped: Array<{ name: string | null; reason: string }> = [];
  const toAdd = selected.filter((row) => {
    if (alreadyIn.has(row.id)) {
      skipped.push({ name: row.name, reason: "already a participant in this cycle" });
      return false;
    }
    if (!row.email?.trim()) {
      skipped.push({ name: row.name, reason: "no email address on file" });
      return false;
    }
    return true;
  });

  const rows = toAdd.map((row) => ({
    cycle_id: body.cycleId!,
    employee_id: row.id,
    name: row.name ?? "Unnamed",
    email: row.email!.trim(),
    level: TIER_TO_SUBJECT_LEVEL[tierOf(row)],
    function_name: row.department ?? "",
    region: "",
    portfolio: row.team ?? "",
  }));

  if (body.dryRun) {
    return NextResponse.json({
      wouldAdd: rows.map((row) => ({ name: row.name, email: row.email, level: row.level })),
      skipped,
    });
  }

  if (!rows.length) {
    return NextResponse.json({ added: [], skipped });
  }

  const { data: inserted, error } = await admin
    .from("assessment_subjects")
    .insert(rows)
    .select("id, name, email, level, employee_id")
    .returns<Array<{ id: string; name: string; email: string; level: string; employee_id: string }>>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("assessment_audit_events").insert({
    cycle_id: body.cycleId,
    action: "assessment_participants_bulk_added",
    metadata: { actorId: userId, tiers, added: inserted?.length ?? 0, skipped: skipped.length },
  });

  return NextResponse.json({ added: inserted ?? [], skipped }, { status: 201 });
}
