import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { validateRaterNomination } from "@/lib/assessmentFramework";
import { isRaterGroup, type RaterGroup } from "@/lib/raterRelationship";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type EmployeeContext = {
  id: string;
  org_id: string;
  platform_role: string;
  email: string;
};

type SubjectRow = {
  id: string;
  cycle_id: string;
  employee_id: string | null;
  name: string;
  email: string | null;
};

type NominationBody = {
  cycleId?: string;
  subjectId?: string;
  assigneeId?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  reviewerGroup?: string;
  status?: "pending" | "approved" | "rejected";
  substitution?: {
    reviewerName?: string;
    reviewerEmail?: string;
    reviewerGroup?: string;
    organisation?: string;
  };
};

const participantNominationLimits: Partial<Record<RaterGroup, number>> = {
  colleague: 3,
  direct_report: 3,
};

function isPrivilegedRole(role?: string | null) {
  return role === "hr_admin" || role === "super_admin" || role === "manager";
}

function isAssignmentManagerRole(role?: string | null) {
  return role === "hr_admin" || role === "super_admin" || role === "manager";
}

async function getRequester(userId: string, admin: ReturnType<typeof getAdminClient>) {
  const { data } = await admin
    .from("employees")
    .select("id, org_id, platform_role, email")
    .eq("user_id", userId)
    .maybeSingle<EmployeeContext>();

  return data;
}

async function cycleBelongsToOrg(admin: ReturnType<typeof getAdminClient>, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle();

  return Boolean(data);
}

async function findSubject(
  admin: ReturnType<typeof getAdminClient>,
  cycleId: string,
  requester: EmployeeContext,
  subjectId?: string,
) {
  let query = admin
    .from("assessment_subjects")
    .select("id, cycle_id, employee_id, name, email")
    .eq("cycle_id", cycleId);

  if (subjectId) {
    query = query.eq("id", subjectId);
  } else {
    query = query.or(`employee_id.eq.${requester.id},email.eq.${requester.email}`);
  }

  const { data } = await query.maybeSingle<SubjectRow>();
  return data;
}

async function findEmployeeIdByEmail(admin: ReturnType<typeof getAdminClient>, orgId: string, email: string) {
  const { data } = await admin
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

async function createReviewerAssignment(input: {
  admin: ReturnType<typeof getAdminClient>;
  cycleId: string;
  subjectId: string;
  orgId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewerGroup: RaterGroup;
  organisation?: string | null;
}) {
  const reviewerEmployeeId = await findEmployeeIdByEmail(input.admin, input.orgId, input.reviewerEmail);
  const { data, error } = await input.admin
    .from("assessment_reviewers")
    .upsert({
      cycle_id: input.cycleId,
      subject_id: input.subjectId,
      reviewer_employee_id: reviewerEmployeeId,
      reviewer_name: input.reviewerName,
      reviewer_email: input.reviewerEmail,
      reviewer_group: input.reviewerGroup,
      organisation: input.organisation ?? null,
      invite_status: "draft",
      invite_channel: input.reviewerGroup === "customer" ? "whatsapp" : "email",
      assessment_scope: input.reviewerGroup === "customer" ? "customer_experience" : "individual",
      status: "not_started",
    }, { onConflict: "subject_id,reviewer_email,reviewer_group" })
    .select("id, subject_id, reviewer_name, reviewer_email, reviewer_group, status, invite_status")
    .single();

  return { data, error };
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");
  const mine = request.nextUrl.searchParams.get("mine") === "1" || request.nextUrl.searchParams.get("mine") === "true";

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
  const employee = await getRequester(user.id, admin);

  const orgId = employee?.org_id;
  if (!orgId) {
    return NextResponse.json({ nominations: [] }, { status: 200 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const ownSubject = mine && employee ? await findSubject(admin, cycleId, employee, subjectId ?? undefined) : null;

  let query = admin
    .from("assessment_nominations")
    .select("id, cycle_id, subject_id, assignee_id, reviewer_name, reviewer_email, reviewer_group, status, created_at")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId);

  if (mine) {
    if (!ownSubject) {
      return NextResponse.json({ subject: null, nominations: [] });
    }
    query = query.eq("subject_id", ownSubject.id);
  } else if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data: nominations } = await query.order("created_at", { ascending: false });

  return NextResponse.json({
    subject: ownSubject ? { id: ownSubject.id, name: ownSubject.name } : undefined,
    nominations: nominations ?? [],
    limits: mine ? participantNominationLimits : undefined,
  });
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
  const employee = await getRequester(user.id, admin);

  const orgId = employee?.org_id;
  const role = employee?.platform_role;

  if (!orgId || !role || !employee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as NominationBody;

  if (!body.cycleId || !body.reviewerName?.trim() || !body.reviewerEmail?.trim()) {
    return NextResponse.json({ error: "cycleId, reviewerName, and reviewerEmail are required" }, { status: 400 });
  }

  const hasCycleAccess = await cycleBelongsToOrg(admin, body.cycleId, orgId);
  if (!hasCycleAccess) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const isPrivileged = isPrivilegedRole(role);
  const subject = await findSubject(admin, body.cycleId, employee, body.subjectId);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const ownsSubject = subject.employee_id === employee.id || subject.email?.toLowerCase() === employee.email.toLowerCase();
  if (!isPrivileged && !ownsSubject) {
    return NextResponse.json({ error: "Participants can only nominate raters for their own assessment" }, { status: 403 });
  }

  const reviewerGroup = String(body.reviewerGroup ?? "colleague").trim().toLowerCase();
  if (!isRaterGroup(reviewerGroup)) {
    return NextResponse.json({ error: "Invalid reviewer group" }, { status: 400 });
  }

  if (!isPrivileged && (reviewerGroup !== "colleague" && reviewerGroup !== "direct_report")) {
    return NextResponse.json({ error: "Participants can nominate colleagues and direct reports only" }, { status: 403 });
  }

  const status = isPrivileged ? body.status ?? "pending" : "pending";

  const existingNominations = await admin
    .from("assessment_nominations")
    .select("reviewer_email, reviewer_group, status")
    .eq("cycle_id", body.cycleId)
    .eq("subject_id", subject.id);

  if (existingNominations.error) {
    return NextResponse.json({ error: existingNominations.error.message }, { status: 500 });
  }

  if (!isPrivileged) {
    const activeGroupCount = (existingNominations.data ?? []).filter(
      (nomination) => nomination.reviewer_group === reviewerGroup && nomination.status !== "rejected",
    ).length;
    const limit = participantNominationLimits[reviewerGroup] ?? 0;
    if (limit > 0 && activeGroupCount >= limit) {
      return NextResponse.json({
        error: `You can nominate exactly ${limit} ${reviewerGroup.replace("_", " ")} raters for this cycle.`,
      }, { status: 400 });
    }
  }

  const validation = validateRaterNomination({
    employeeId: body.assigneeId ?? subject.id,
    assigneeId: body.assigneeId ?? subject.id,
    nominations: [
      ...(existingNominations.data ?? []).map((row) => ({
        reviewerId: row.reviewer_email,
        reviewerGroup: row.reviewer_group,
      })),
      {
        reviewerId: body.reviewerEmail.trim().toLowerCase(),
        reviewerGroup,
      },
    ],
    allowedGroups: isPrivileged ? ["self", "line_manager", "direct_report", "colleague", "customer"] : ["direct_report", "colleague"],
  });

  if (!validation.valid) {
    return NextResponse.json({ error: "Invalid nomination payload", errors: validation.errors }, { status: 400 });
  }

  const payload = {
    org_id: orgId,
    cycle_id: body.cycleId,
    subject_id: subject.id,
    assignee_id: body.assigneeId ?? subject.employee_id,
    reviewer_employee_id: null,
    reviewer_name: body.reviewerName.trim(),
    reviewer_email: body.reviewerEmail.trim().toLowerCase(),
    reviewer_group: reviewerGroup,
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

  let assignment = null;
  let replacement = null;

  if (status === "approved" && isAssignmentManagerRole(role)) {
    const assignmentResult = await createReviewerAssignment({
      admin,
      cycleId: body.cycleId,
      subjectId: subject.id,
      orgId,
      reviewerName: payload.reviewer_name,
      reviewerEmail: payload.reviewer_email,
      reviewerGroup,
    });

    if (assignmentResult.error) {
      return NextResponse.json({ error: assignmentResult.error.message }, { status: 500 });
    }

    assignment = assignmentResult.data;
  }

  if (status === "rejected" && isAssignmentManagerRole(role) && body.substitution) {
    const replacementGroup = String(body.substitution.reviewerGroup ?? reviewerGroup).trim().toLowerCase();
    const replacementEmail = body.substitution.reviewerEmail?.trim().toLowerCase();
    const replacementName = body.substitution.reviewerName?.trim();

    if (!replacementName || !replacementEmail || !isRaterGroup(replacementGroup)) {
      return NextResponse.json({ error: "Substitution requires reviewerName, reviewerEmail, and a valid reviewerGroup" }, { status: 400 });
    }

    const replacementPayload = {
      org_id: orgId,
      cycle_id: body.cycleId,
      subject_id: subject.id,
      assignee_id: body.assigneeId ?? subject.employee_id,
      reviewer_employee_id: null,
      reviewer_name: replacementName,
      reviewer_email: replacementEmail,
      reviewer_group: replacementGroup,
      status: "approved",
      created_by: user.id,
    };

    const { data: replacementNomination, error: replacementError } = await admin
      .from("assessment_nominations")
      .upsert(replacementPayload, { onConflict: "cycle_id,subject_id,reviewer_email,reviewer_group" })
      .select("id, cycle_id, subject_id, reviewer_name, reviewer_email, reviewer_group, status, created_at")
      .single();

    if (replacementError) {
      return NextResponse.json({ error: replacementError.message }, { status: 500 });
    }

    const assignmentResult = await createReviewerAssignment({
      admin,
      cycleId: body.cycleId,
      subjectId: subject.id,
      orgId,
      reviewerName: replacementName,
      reviewerEmail: replacementEmail,
      reviewerGroup: replacementGroup,
      organisation: body.substitution.organisation,
    });

    if (assignmentResult.error) {
      return NextResponse.json({ error: assignmentResult.error.message }, { status: 500 });
    }

    replacement = {
      nomination: replacementNomination,
      assignment: assignmentResult.data,
    };
  }

  return NextResponse.json({ nomination: data, assignment, replacement }, { status: 201 });
}
