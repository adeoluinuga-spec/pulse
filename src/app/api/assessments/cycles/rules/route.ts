import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { raterRulesUpdate, type RaterRules } from "@/lib/assessmentRaterRules";

/**
 * The cycle's rater rules: how many to aim for, how few may stand alone, and
 * what happens to a group that falls short.
 *
 * Separate from the status PATCH because these are a different kind of change
 * with a different constraint: a status moves whenever HR says so, whereas
 * these settings back the confidentiality promise made in the invitation email
 * and stop being editable the moment somebody has relied on them.
 */

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type CycleRow = {
  id: string;
  min_responses_per_group: number | null;
  suppression_mode: string | null;
  rater_quota: { colleague?: number; direct_report?: number } | null;
  rater_rules_locked_at: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireCycleAdmin(cycleId: string): Promise<
  | { ok: true; admin: Admin; userId: string; cycle: CycleRow }
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
    .maybeSingle<CycleRow>();

  if (!cycle) {
    return { ok: false, response: NextResponse.json({ error: "Cycle not found" }, { status: 404 }) };
  }

  return { ok: true, admin, userId: user.id, cycle };
}

function present(cycle: CycleRow): RaterRules & { lockedAt: string | null } {
  return {
    minimumPerGroup: cycle.min_responses_per_group ?? 3,
    suppressionMode: cycle.suppression_mode === "suppress" ? "suppress" : "merge",
    quota: {
      colleague: cycle.rater_quota?.colleague ?? 3,
      direct_report: cycle.rater_quota?.direct_report ?? 3,
    },
    lockedAt: cycle.rater_rules_locked_at,
  };
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const auth = await requireCycleAdmin(cycleId);
  if (!auth.ok) return auth.response;

  return NextResponse.json({ rules: present(auth.cycle) });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    cycleId?: string;
    minimumPerGroup?: number;
    suppressionMode?: string;
    quota?: { colleague?: number; direct_report?: number };
  };

  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const auth = await requireCycleAdmin(body.cycleId);
  if (!auth.ok) return auth.response;
  const { admin, userId, cycle } = auth;

  const outcome = raterRulesUpdate({
    current: present(cycle),
    requested: {
      minimumPerGroup: body.minimumPerGroup,
      suppressionMode: body.suppressionMode,
      quota: body.quota,
    },
    lockedAt: cycle.rater_rules_locked_at,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: 409 });
  }

  const { error } = await admin
    .from("assessment_cycles")
    .update({
      min_responses_per_group: outcome.rules.minimumPerGroup,
      suppression_mode: outcome.rules.suppressionMode,
      rater_quota: outcome.rules.quota,
    })
    .eq("id", cycle.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("assessment_audit_events").insert({
    cycle_id: cycle.id,
    action: "assessment_rater_rules_changed",
    metadata: { actorId: userId, from: present(cycle), to: outcome.rules },
  });

  return NextResponse.json({ rules: { ...outcome.rules, lockedAt: cycle.rater_rules_locked_at } });
}
