import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import { buildMyAssessmentStatus } from "@/lib/assessmentDashboard";
import { escapeLikePattern } from "@/lib/reviewQueue";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type EmployeeRow = {
  id: string;
  org_id: string;
  name: string | null;
  email: string | null;
};

type CycleRow = {
  id: string;
  name: string | null;
  status: string | null;
  starts_on: string | null;
  closes_on: string | null;
  created_at: string | null;
};

type SubjectRow = {
  id: string;
  employee_id: string | null;
  name: string | null;
  email: string | null;
};

type ReviewerRow = {
  id: string;
  subject_id: string;
  reviewer_group: string | null;
  status: string | null;
  invite_status: string | null;
  token_expires_at: string | null;
};

/**
 * Which cycle this employee's card should be about.
 *
 * A live cycle always wins, then one being set up, then one in calibration. A
 * closed cycle is chosen only when there is nothing else — which is the point:
 * the query used to filter closed cycles out entirely, so the last cycle of the
 * year vanished from every dashboard the moment HR closed it and the card fell
 * back to "no 360 assessment is active yet". Participants waiting on a report
 * were told nothing was happening at all.
 */
function chooseCycle(cycles: CycleRow[]): CycleRow | null {
  return cycles.find((cycle) => cycle.status === "collecting")
    ?? cycles.find((cycle) => cycle.status === "setup")
    ?? cycles.find((cycle) => cycle.status === "calibration")
    ?? cycles[0]
    ?? null;
}

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, name, email")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeRow>();

  if (!employee?.org_id) {
    return NextResponse.json({ status: buildMyAssessmentStatus({ cycle: null, subjects: [], reviewerAssignments: [] }) });
  }

  const { data: cycles, error: cyclesError } = await admin
    .from("assessment_cycles")
    .select("id, name, status, starts_on, closes_on, created_at")
    .eq("org_id", employee.org_id)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<CycleRow[]>();

  if (cyclesError) return NextResponse.json({ error: cyclesError.message }, { status: 500 });

  const cycle = chooseCycle(cycles ?? []);
  if (!cycle) {
    return NextResponse.json({ status: buildMyAssessmentStatus({ cycle: null, subjects: [], reviewerAssignments: [] }) });
  }

  const subjectQueries = [
    admin
      .from("assessment_subjects")
      .select("id, employee_id, name, email")
      .eq("cycle_id", cycle.id)
      .eq("employee_id", employee.id)
      // Somebody withdrawn should stop being told they are being assessed.
      .is("withdrawn_at", null)
      .returns<SubjectRow[]>(),
  ];
  if (employee.email?.trim()) {
    subjectQueries.push(
      admin
        .from("assessment_subjects")
        .select("id, employee_id, name, email")
        .eq("cycle_id", cycle.id)
        .ilike("email", escapeLikePattern(employee.email.trim()))
        .is("withdrawn_at", null)
        .returns<SubjectRow[]>(),
    );
  }

  const reviewerQueries = [
    admin
      .from("assessment_reviewers")
      .select("id, subject_id, reviewer_group, status, invite_status, token_expires_at")
      .eq("cycle_id", cycle.id)
      .eq("reviewer_employee_id", employee.id)
      .returns<ReviewerRow[]>(),
  ];
  if (employee.email?.trim()) {
    reviewerQueries.push(
      admin
        .from("assessment_reviewers")
        .select("id, subject_id, reviewer_group, status, invite_status, token_expires_at")
        .eq("cycle_id", cycle.id)
        .ilike("reviewer_email", escapeLikePattern(employee.email.trim()))
        .returns<ReviewerRow[]>(),
    );
  }

  const [{ data: notifications }, subjectResults, reviewerResults] = await Promise.all([
    admin
      .from("notifications")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("is_read", false)
      .in("type", ["assessment_cycle_launched", "assessment_participant", "assessment_reminder"]),
    Promise.all(subjectQueries),
    Promise.all(reviewerQueries),
  ]);

  const subjectsById = new Map<string, SubjectRow>();
  for (const result of subjectResults) {
    for (const subject of result.data ?? []) subjectsById.set(subject.id, subject);
  }

  const reviewersById = new Map<string, ReviewerRow>();
  for (const result of reviewerResults) {
    for (const reviewer of result.data ?? []) reviewersById.set(reviewer.id, reviewer);
  }

  const reviewerSubjectIds = Array.from(new Set([...reviewersById.values()].map((reviewer) => reviewer.subject_id)));
  const { data: reviewerSubjects } = reviewerSubjectIds.length
    ? await admin
        .from("assessment_subjects")
        .select("id, name")
        .in("id", reviewerSubjectIds)
        .returns<Array<{ id: string; name: string | null }>>()
    : { data: [] as Array<{ id: string; name: string | null }> };
  const subjectNameById = new Map((reviewerSubjects ?? []).map((subject) => [subject.id, subject.name ?? "Unnamed participant"]));

  const status = buildMyAssessmentStatus({
    cycle: {
      id: cycle.id,
      name: cycle.name?.trim() || "360 assessment",
      status: cycle.status ?? "setup",
      startsOn: cycle.starts_on,
      closesOn: cycle.closes_on,
    },
    subjects: [...subjectsById.values()].map((subject) => ({
      id: subject.id,
      name: subject.name?.trim() || employee.name?.trim() || "You",
      email: subject.email,
    })),
    reviewerAssignments: [...reviewersById.values()].map((reviewer) => ({
      id: reviewer.id,
      subjectName: subjectNameById.get(reviewer.subject_id) ?? "Unnamed participant",
      reviewerGroup: reviewer.reviewer_group ?? "reviewer",
      status: reviewer.status ?? "not_started",
      inviteStatus: reviewer.invite_status ?? "draft",
      tokenExpiresAt: reviewer.token_expires_at,
    })),
    unreadAssessmentNotifications: notifications?.length ?? 0,
  });

  return NextResponse.json({ status });
}
