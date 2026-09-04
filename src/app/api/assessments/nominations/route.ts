import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { validateRaterNomination } from "@/lib/assessmentFramework";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");

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
    return NextResponse.json({ nominations: [] }, { status: 200 });
  }

  let query = admin
    .from("assessment_nominations")
    .select("id, cycle_id, subject_id, assignee_id, reviewer_name, reviewer_email, reviewer_group, status, created_at")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId);

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data: nominations } = await query.order("created_at", { ascending: false });

  return NextResponse.json({ nominations: nominations ?? [] });
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

  const orgId = (employee as { org_id?: string } | null)?.org_id;
  const role = (employee as { platform_role?: string } | null)?.platform_role;

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin" && role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    assigneeId?: string;
    reviewerName?: string;
    reviewerEmail?: string;
    reviewerGroup?: string;
    status?: "pending" | "approved" | "rejected";
  };

  if (!body.cycleId || !body.subjectId || !body.reviewerName?.trim() || !body.reviewerEmail?.trim()) {
    return NextResponse.json({ error: "cycleId, subjectId, reviewerName, and reviewerEmail are required" }, { status: 400 });
  }

  const existingNominations = await admin
    .from("assessment_nominations")
    .select("reviewer_email, reviewer_group")
    .eq("cycle_id", body.cycleId)
    .eq("subject_id", body.subjectId);

  const validation = validateRaterNomination({
    employeeId: body.assigneeId ?? body.subjectId,
    assigneeId: body.assigneeId ?? body.subjectId,
    nominations: [
      ...(existingNominations.data ?? []).map((row) => ({
        reviewerId: row.reviewer_email,
        reviewerGroup: row.reviewer_group,
      })),
      {
        reviewerId: body.reviewerEmail.trim().toLowerCase(),
        reviewerGroup: body.reviewerGroup ?? "colleague",
      },
    ],
    allowedGroups: ["line_manager", "direct_report", "colleague", "customer"],
  });

  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid nomination payload", errors: validation.errors }, { status: 400 });
  }

  const status = body.status ?? "pending";
  const payload = {
    org_id: orgId,
    cycle_id: body.cycleId,
    subject_id: body.subjectId,
    assignee_id: body.assigneeId ?? null,
    reviewer_employee_id: null,
    reviewer_name: body.reviewerName.trim(),
    reviewer_email: body.reviewerEmail.trim().toLowerCase(),
    reviewer_group: body.reviewerGroup ?? "colleague",
    status,
    created_by: user.id,
  };

  const { data, error } = await admin
    .from("assessment_nominations")
    .upsert(payload, { onConflict: "cycle_id,subject_id,reviewer_email,reviewer_group" })
    .select("id, cycle_id, subject_id, reviewer_name, reviewer_email, reviewer_group, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nomination: data }, { status: 201 });
}
