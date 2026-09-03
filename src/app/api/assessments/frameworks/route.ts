import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { normalizeAssessmentFramework } from "@/lib/assessmentFramework";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId) {
    return NextResponse.json({ frameworks: [] }, { status: 200 });
  }

  const { data: frameworks } = await admin
    .from("assessment_frameworks")
    .select("id, name, levels, business_functions, default_groups, competencies, self_assessment_enabled, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ frameworks: frameworks ?? [] });
}

export async function POST(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (employee as { platform_role?: string } | null)?.platform_role;
  const orgId = (employee as { org_id?: string } | null)?.org_id;

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    levels?: string[];
    businessFunctions?: string[];
    defaultGroups?: string[];
    competencies?: Array<{
      id?: string;
      name?: string;
      group?: string;
      level?: string;
      function?: string;
      description?: string;
      active?: boolean;
    }>;
    selfAssessmentEnabled?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const framework = normalizeAssessmentFramework({
    orgId,
    name: body.name,
    levels: body.levels,
    businessFunctions: body.businessFunctions,
    defaultGroups: body.defaultGroups,
    competencies: body.competencies,
    selfAssessmentEnabled: body.selfAssessmentEnabled,
  });

  if (!framework.ready) {
    return NextResponse.json({ error: "Framework must include at least one competency" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("assessment_frameworks")
    .insert({
      org_id: orgId,
      name: framework.name,
      levels: framework.levels,
      business_functions: framework.businessFunctions,
      default_groups: framework.defaultGroups,
      competencies: framework.competencies,
      self_assessment_enabled: framework.selfAssessmentEnabled,
      created_by: user.id,
    })
    .select("id, name, levels, business_functions, default_groups, competencies, self_assessment_enabled, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ framework: data }, { status: 201 });
}
