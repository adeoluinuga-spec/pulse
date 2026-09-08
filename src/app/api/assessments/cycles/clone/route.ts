import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildCycleClonePlan } from "@/lib/assessmentComparison";

export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type EmployeeContext = {
  id: string;
  org_id: string | null;
  platform_role: string | null;
};

type CycleRow = {
  id: string;
  org_id: string;
  name: string;
  client_context: string | null;
  assessment_type: string | null;
  levels: string[] | null;
  reviewer_weights: Record<string, number> | null;
  competency_model: unknown;
};

type CompetencyRow = {
  id: string;
  framework_id: string | null;
  framework_version: number | null;
  name: string;
  description: string | null;
  weight: number | string | null;
  sort_order: number | null;
  telco_signals: string[] | null;
};

type ItemRow = {
  id: string;
  competency_id: string | null;
  item_type: "scale" | "text";
  body: string;
  display_order: number | null;
  is_active: boolean | null;
};

type SubjectRow = {
  employee_id: string | null;
  name: string;
  email: string | null;
  level: string;
  function_name: string | null;
  region: string | null;
  portfolio: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getRequester(): Promise<
  { admin: Admin; userId: string; employee: EmployeeContext; error: null } | { admin: Admin; userId: null; employee: null; error: NextResponse }
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
  if (!user) return { admin, userId: null, employee: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  if (!employee?.org_id || (employee.platform_role !== "hr_admin" && employee.platform_role !== "super_admin")) {
    return { admin, userId: null, employee: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { admin, userId: user.id, employee, error: null };
}

function normalizeSubjects(input: unknown): SubjectRow[] | null {
  if (!Array.isArray(input)) return null;
  return input
    .map((row) => row as Partial<SubjectRow>)
    .filter((row) => row.name?.trim() && row.email?.trim())
    .map((row) => ({
      employee_id: row.employee_id ?? null,
      name: row.name!.trim(),
      email: row.email!.trim(),
      level: row.level ?? "assistant_director",
      function_name: row.function_name ?? null,
      region: row.region ?? null,
      portfolio: row.portfolio ?? null,
    }));
}

export async function POST(request: NextRequest) {
  const { admin, userId, employee, error } = await getRequester();
  if (error) return error;

  const body = (await request.json()) as {
    priorCycleId?: string;
    name?: string;
    startsOn?: string | null;
    closesOn?: string | null;
    status?: string | null;
    populationMode?: "carry_forward" | "replace";
    subjects?: unknown;
  };

  if (!body.priorCycleId) {
    return NextResponse.json({ error: "priorCycleId is required" }, { status: 400 });
  }

  const { data: priorCycle, error: priorError } = await admin
    .from("assessment_cycles")
    .select("id, org_id, name, client_context, assessment_type, levels, reviewer_weights, competency_model")
    .eq("id", body.priorCycleId)
    .eq("org_id", employee.org_id)
    .maybeSingle<CycleRow>();

  if (priorError) return NextResponse.json({ error: priorError.message }, { status: 500 });
  if (!priorCycle) return NextResponse.json({ error: "Prior cycle not found" }, { status: 404 });

  const [competenciesResult, itemsResult, subjectsResult] = await Promise.all([
    admin
      .from("assessment_competencies")
      .select("id, framework_id, framework_version, name, description, weight, sort_order, telco_signals")
      .eq("cycle_id", priorCycle.id)
      .order("sort_order", { ascending: true })
      .returns<CompetencyRow[]>(),
    admin
      .from("assessment_items")
      .select("id, competency_id, item_type, body, display_order, is_active")
      .eq("cycle_id", priorCycle.id)
      .order("display_order", { ascending: true })
      .returns<ItemRow[]>(),
    admin
      .from("assessment_subjects")
      .select("employee_id, name, email, level, function_name, region, portfolio")
      .eq("cycle_id", priorCycle.id)
      .order("name", { ascending: true })
      .returns<SubjectRow[]>(),
  ]);

  if (competenciesResult.error || itemsResult.error || subjectsResult.error) {
    return NextResponse.json({ error: "Unable to load prior cycle contents" }, { status: 500 });
  }

  const plan = buildCycleClonePlan({
    prior: {
      id: priorCycle.id,
      name: priorCycle.name,
      clientContext: priorCycle.client_context,
      assessmentType: priorCycle.assessment_type,
      levels: priorCycle.levels,
      reviewerWeights: priorCycle.reviewer_weights,
      competencyModel: priorCycle.competency_model,
    },
    name: body.name,
    startsOn: body.startsOn,
    closesOn: body.closesOn,
    status: body.status,
    populationMode: body.populationMode,
  });
  const replacementSubjects = normalizeSubjects(body.subjects);
  const subjectsToCopy = plan.populationMode === "replace" && replacementSubjects
    ? replacementSubjects
    : subjectsResult.data ?? [];

  const { data: newCycle, error: cycleError } = await admin
    .from("assessment_cycles")
    .insert({
      org_id: employee.org_id,
      created_by: userId,
      ...plan.cycle,
    })
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context, prior_cycle_id")
    .single<{ id: string; name: string }>();

  if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });

  const competencyIdMap = new Map<string, string>();
  if ((competenciesResult.data ?? []).length) {
    const { data: copiedCompetencies, error: copyCompetenciesError } = await admin
      .from("assessment_competencies")
      .insert((competenciesResult.data ?? []).map((competency) => ({
        cycle_id: newCycle.id,
        framework_id: competency.framework_id,
        framework_version: competency.framework_version,
        name: competency.name,
        description: competency.description,
        weight: competency.weight ?? 0,
        sort_order: competency.sort_order ?? 0,
        telco_signals: competency.telco_signals ?? [],
      })))
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .returns<Array<{ id: string; name: string; sort_order: number | null }>>();

    if (copyCompetenciesError) return NextResponse.json({ error: copyCompetenciesError.message }, { status: 500 });
    (competenciesResult.data ?? []).forEach((source, index) => {
      const copied = copiedCompetencies?.[index];
      if (copied) competencyIdMap.set(source.id, copied.id);
    });
  }

  if ((itemsResult.data ?? []).length) {
    const { error: copyItemsError } = await admin
      .from("assessment_items")
      .insert((itemsResult.data ?? []).map((item) => ({
        cycle_id: newCycle.id,
        competency_id: item.competency_id ? competencyIdMap.get(item.competency_id) ?? null : null,
        item_type: item.item_type,
        body: item.body,
        display_order: item.display_order ?? 0,
        is_active: item.is_active ?? true,
      })));

    if (copyItemsError) return NextResponse.json({ error: copyItemsError.message }, { status: 500 });
  }

  if (subjectsToCopy.length) {
    const { error: copySubjectsError } = await admin
      .from("assessment_subjects")
      .insert(subjectsToCopy.map((subject) => ({
        cycle_id: newCycle.id,
        employee_id: subject.employee_id ?? null,
        name: subject.name,
        email: subject.email,
        level: subject.level,
        function_name: subject.function_name,
        region: subject.region,
        portfolio: subject.portfolio,
      })));

    if (copySubjectsError) return NextResponse.json({ error: copySubjectsError.message }, { status: 500 });
  }

  await admin.from("assessment_audit_events").insert({
    cycle_id: newCycle.id,
    action: "assessment_cycle_cloned",
    metadata: {
      priorCycleId: priorCycle.id,
      clonedBy: userId,
      competencyCount: competenciesResult.data?.length ?? 0,
      itemCount: itemsResult.data?.length ?? 0,
      subjectCount: subjectsToCopy.length,
      populationMode: plan.populationMode,
    },
  });

  return NextResponse.json({
    cycle: newCycle,
    clonedFrom: priorCycle.id,
    copied: {
      competencies: competenciesResult.data?.length ?? 0,
      items: itemsResult.data?.length ?? 0,
      subjects: subjectsToCopy.length,
    },
    populationMode: plan.populationMode,
  }, { status: 201 });
}
