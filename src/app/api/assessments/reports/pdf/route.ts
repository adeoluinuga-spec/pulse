import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  AggregateAssessmentReportDocument,
  IndividualAssessmentReportDocument,
} from "@/lib/assessmentPdfDocument";
import {
  buildMockAggregateReport,
  buildMockIndividualReport,
  loadPdfReportData,
} from "@/lib/assessmentPdfData";
import {
  canReadAggregateReport,
  canReadIndividualReport,
  reportStateOf,
} from "@/lib/assessmentReportAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

type EmployeeContext = {
  id: string;
  org_id: string | null;
  platform_role: string | null;
};

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getAuthenticatedEmployee() {
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
  if (!user) return { user: null, employee: null };

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  return { user, employee };
}

async function loadCycle(admin: Admin, cycleId: string, orgId: string) {
  const { data } = await admin
    .from("assessment_cycles")
    .select("id, line_manager_report_access_enabled")
    .eq("id", cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; line_manager_report_access_enabled?: boolean | null }>();

  return data;
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function pdfDocument(element: React.ReactElement): Parameters<typeof renderToBuffer>[0] {
  return element as Parameters<typeof renderToBuffer>[0];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

async function logExport(input: {
  admin: Admin;
  request: NextRequest;
  employee: EmployeeContext;
  userId: string;
  cycleId: string;
  subjectId?: string | null;
  reportType: "individual" | "aggregate";
}) {
  const ip = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? input.request.headers.get("x-real-ip")
    ?? null;
  await input.admin.from("assessment_audit_events").insert({
    cycle_id: input.cycleId,
    subject_id: input.subjectId ?? null,
    action: "report_exported",
    metadata: {
      actorUserId: input.userId,
      actorEmployeeId: input.employee.id,
      actorRole: input.employee.platform_role,
      ip,
      userAgent: input.request.headers.get("user-agent"),
      reportType: input.reportType,
    },
  });
}

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");
  const type = request.nextUrl.searchParams.get("type") ?? "individual";

  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

  const { user, employee } = await getAuthenticatedEmployee();
  if (!user || !employee) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!employee.org_id || !employee.platform_role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = getAdminClient();
  const cycle = await loadCycle(admin, cycleId, employee.org_id);
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const reportData = await loadPdfReportData(admin, cycleId);
  const generatedAt = new Date().toISOString();

  if (type === "aggregate") {
    if (!canReadAggregateReport(employee.platform_role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const report = buildMockAggregateReport(reportData, generatedAt);
    const buffer = await renderToBuffer(pdfDocument(React.createElement(AggregateAssessmentReportDocument, { report })));
    await logExport({ admin, request, employee, userId: user.id, cycleId, reportType: "aggregate" });
    return pdfResponse(buffer, `${slug(report.cycle.name)}-aggregate-360-report.pdf`);
  }

  if (!subjectId) {
    return NextResponse.json({ error: "subjectId required for individual report" }, { status: 400 });
  }

  const { data: subject } = await admin
    .from("assessment_subjects")
    .select("id, employee_id")
    .eq("id", subjectId)
    .eq("cycle_id", cycleId)
    .maybeSingle<{ id: string; employee_id: string | null }>();
  const { data: reportRow } = await admin
    .from("assessment_reports")
    .select("released_at, report_status")
    .eq("cycle_id", cycleId)
    .eq("subject_id", subjectId)
    .maybeSingle<{ released_at: string | null; report_status?: string | null }>();

  if (!subject || !reportRow) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { data: subjectEmployee } = subject.employee_id
    ? await admin
        .from("employees")
        .select("line_manager_id")
        .eq("id", subject.employee_id)
        .maybeSingle<{ line_manager_id: string | null }>()
    : { data: null };
  const allowed = canReadIndividualReport({
    role: employee.platform_role,
    reportState: reportStateOf({ reportStatus: reportRow.report_status, releasedAt: reportRow.released_at }),
    ownsSubject: subject.employee_id === employee.id,
    managesSubject: subjectEmployee?.line_manager_id === employee.id,
    lineManagerAccessEnabled: Boolean(cycle.line_manager_report_access_enabled),
  });

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = buildMockIndividualReport(reportData, subjectId, generatedAt);
  const buffer = await renderToBuffer(pdfDocument(React.createElement(IndividualAssessmentReportDocument, { report })));
  await logExport({ admin, request, employee, userId: user.id, cycleId, subjectId, reportType: "individual" });
  return pdfResponse(buffer, `${slug(report.subject.name)}-360-report.pdf`);
}
