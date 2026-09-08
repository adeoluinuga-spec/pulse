import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import {
  buildBulkReviewerErrorReportCsv,
  parseBulkReviewerCsv,
  validateBulkReviewerRows,
  type AssessmentEmployeeLookup,
  type AssessmentSubjectLookup,
  type BulkReviewerCsvRow,
  type ExistingReviewerAssignment,
} from "@/lib/assessmentReviewerBulk";

export const dynamic = "force-dynamic";

type EmployeeContext = {
  id: string;
  org_id: string;
  platform_role: string;
};

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getRequester() {
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
  return user;
}

function isAdminRole(role?: string | null) {
  return role === "hr_admin" || role === "super_admin";
}

async function parseUpload(file: File): Promise<BulkReviewerCsvRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || file.type.includes("spreadsheet")) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const [firstSheetName] = workbook.SheetNames;
    if (!firstSheetName) return [];

    return XLSX.utils.sheet_to_json<BulkReviewerCsvRow>(workbook.Sheets[firstSheetName], {
      defval: "",
      raw: false,
    });
  }

  return parseBulkReviewerCsv(await file.text());
}

function csvResponse(csv: string, status = 200) {
  return new NextResponse(csv, {
    status,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"pulse-reviewer-bulk-report.csv\"",
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequester();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: requester } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  if (!requester?.org_id || !isAdminRole(requester.platform_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const cycleId = String(formData.get("cycleId") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "false").toLowerCase() === "true";
  const asCsv = String(formData.get("format") ?? "").toLowerCase() === "csv";
  const cap = Number(formData.get("cap") ?? 6);
  const file = formData.get("file");

  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A CSV or XLSX file is required" }, { status: 400 });
  }

  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", requester.org_id)
    .maybeSingle();

  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const [subjectsResult, employeesResult, existingResult] = await Promise.all([
    admin
      .from("assessment_subjects")
      .select("id, name, email, employee_id")
      .eq("cycle_id", cycleId),
    admin
      .from("employees")
      .select("id, name, email, line_manager_id")
      .eq("org_id", requester.org_id),
    admin
      .from("assessment_reviewers")
      .select("subject_id, reviewer_email, reviewer_group")
      .eq("cycle_id", cycleId),
  ]);

  if (subjectsResult.error || employeesResult.error || existingResult.error) {
    return NextResponse.json({ error: "Unable to load cycle validation data" }, { status: 500 });
  }

  const uploadedRows = await parseUpload(file);
  const validation = validateBulkReviewerRows({
    rows: uploadedRows,
    subjects: (subjectsResult.data ?? []).map((subject) => ({
      id: subject.id,
      name: subject.name,
      email: subject.email ?? "",
      employeeId: subject.employee_id,
    })) satisfies AssessmentSubjectLookup[],
    employees: (employeesResult.data ?? []).map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      lineManagerId: employee.line_manager_id,
    })) satisfies AssessmentEmployeeLookup[],
    existingAssignments: (existingResult.data ?? []).map((assignment) => ({
      subjectId: assignment.subject_id,
      reviewerEmail: assignment.reviewer_email,
      reviewerGroup: assignment.reviewer_group,
    })) satisfies ExistingReviewerAssignment[],
    cap: Number.isFinite(cap) && cap > 0 ? cap : 6,
  });

  const reportCsv = buildBulkReviewerErrorReportCsv(validation.rows);

  if (asCsv) {
    return csvResponse(reportCsv, validation.canImport ? 200 : 422);
  }

  if (!confirm) {
    return NextResponse.json({
      imported: false,
      requiresConfirmation: true,
      canImport: validation.canImport,
      rows: validation.rows.map(({ assignment, ...row }) => row),
      loadWarnings: validation.loadWarnings,
      errorReportCsv: reportCsv,
    }, { status: validation.canImport ? 200 : 422 });
  }

  if (!validation.canImport) {
    return NextResponse.json({
      imported: false,
      canImport: false,
      rows: validation.rows.map(({ assignment, ...row }) => row),
      loadWarnings: validation.loadWarnings,
      errorReportCsv: reportCsv,
    }, { status: 422 });
  }

  const { data: inserted, error: insertError } = await admin
    .from("assessment_reviewers")
    .insert(validation.validAssignments.map((assignment) => ({
      cycle_id: cycleId,
      subject_id: assignment.subjectId,
      reviewer_employee_id: assignment.reviewerEmployeeId,
      reviewer_name: assignment.reviewerName,
      reviewer_email: assignment.reviewerEmail,
      reviewer_group: assignment.reviewerGroup,
      organisation: assignment.organisation,
      invite_status: "draft",
      invite_channel: assignment.reviewerGroup === "customer" ? "whatsapp" : "email",
      assessment_scope: assignment.reviewerGroup === "customer" ? "customer_experience" : "individual",
      status: "not_started",
    })))
    .select("id, subject_id, reviewer_email, reviewer_group");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await admin.from("assessment_audit_events").insert({
    cycle_id: cycleId,
    action: "reviewer_bulk_imported",
    metadata: {
      importedBy: user.id,
      rowCount: validation.rows.length,
      assignmentCount: inserted?.length ?? 0,
      loadWarnings: validation.loadWarnings,
    },
  });

  return NextResponse.json({
    imported: true,
    assignmentCount: inserted?.length ?? 0,
    rows: validation.rows.map(({ assignment, ...row }) => row),
    loadWarnings: validation.loadWarnings,
    errorReportCsv: reportCsv,
  }, { status: 201 });
}
