import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { escapeLikePattern } from "@/lib/reviewQueue";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  if (!orgId) return NextResponse.json({ subjects: [] }, { status: 200 });

  const { data: subjects } = await admin
    .from("assessment_subjects")
    .select("id, cycle_id, name, email, level, function_name, region, portfolio")
    .eq("cycle_id", cycleId)
    .order("name", { ascending: true });

  return NextResponse.json({ subjects: subjects ?? [] });
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    cycleId?: string;
    name?: string;
    email?: string;
    level?: string;
    functionName?: string;
    region?: string;
    portfolio?: string;
  };

  if (!body.cycleId || !body.name?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: "cycleId, name, and email are required" }, { status: 400 });
  }

  const email = body.email.trim();

  // Link the participant to their employee record. Without this the participant
  // report tier can never resolve: the RLS policy joins
  // assessment_subjects.employee_id -> employees.user_id, so an unlinked subject
  // means that person can never open their own released report.
  const { data: matchedEmployee } = await admin
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", escapeLikePattern(email))
    .maybeSingle<{ id: string }>();

  const { data, error } = await admin
    .from("assessment_subjects")
    .insert({
      cycle_id: body.cycleId,
      employee_id: matchedEmployee?.id ?? null,
      name: body.name.trim(),
      email,
      level: body.level ?? "assistant_director",
      function_name: body.functionName ?? "",
      region: body.region ?? "",
      portfolio: body.portfolio ?? "",
    })
    .select("id, cycle_id, employee_id, name, email, level, function_name, region, portfolio")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Created, but say so loudly: an unlinked participant will never be able to
  // open their own report, and that is invisible until release day.
  const warning = matchedEmployee
    ? undefined
    : `No employee record matches ${email} in this organisation, so this participant is not linked to a login and will not be able to open their own report. Add them to the employee list, then re-add them here.`;

  return NextResponse.json({ subject: data, warning }, { status: 201 });
}
