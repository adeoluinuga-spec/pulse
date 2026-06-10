import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verifySuperAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() === process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
}

export async function GET() {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = getAdminClient();

  const [orgsRes, empsRes, cyclesRes, goalsRes] = await Promise.all([
    admin.from("organisations")
      .select("id, name, slug, currency, appraisal_cadence, created_at")
      .order("created_at", { ascending: false }),
    admin.from("employees").select("org_id, platform_role"),
    admin.from("appraisal_cycles").select("org_id, name").eq("status", "active"),
    admin.from("goals").select("org_id"),
  ]);

  const orgs = (orgsRes.data ?? []) as Array<{
    id: string; name: string; slug: string;
    currency: string; appraisal_cadence: string; created_at: string;
  }>;
  const emps = (empsRes.data ?? []) as Array<{ org_id: string; platform_role: string }>;
  const cycles = (cyclesRes.data ?? []) as Array<{ org_id: string; name: string }>;
  const goals = (goalsRes.data ?? []) as Array<{ org_id: string }>;

  const empMap: Record<string, { total: number; hr: number; exec: number }> = {};
  emps.forEach((e) => {
    if (!empMap[e.org_id]) empMap[e.org_id] = { total: 0, hr: 0, exec: 0 };
    empMap[e.org_id].total++;
    if (e.platform_role === "hr_admin") empMap[e.org_id].hr++;
    if (e.platform_role === "executive_view") empMap[e.org_id].exec++;
  });

  const cycleMap: Record<string, string> = {};
  cycles.forEach((c) => { cycleMap[c.org_id] = c.name; });

  const goalMap: Record<string, number> = {};
  goals.forEach((g) => { goalMap[g.org_id] = (goalMap[g.org_id] ?? 0) + 1; });

  const enriched = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    currency: org.currency,
    appraisalCadence: org.appraisal_cadence,
    createdAt: org.created_at,
    employeeCount: empMap[org.id]?.total ?? 0,
    hrCount: empMap[org.id]?.hr ?? 0,
    execCount: empMap[org.id]?.exec ?? 0,
    goalCount: goalMap[org.id] ?? 0,
    activeCycle: cycleMap[org.id] ?? null,
  }));

  return NextResponse.json({ orgs: enriched });
}

export async function DELETE(request: NextRequest) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = (await request.json()) as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getAdminClient();
  const { error } = await admin.from("organisations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
