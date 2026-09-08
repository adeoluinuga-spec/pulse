import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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
import { canManageReportState } from "@/lib/assessmentReportAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportStatus = "pending" | "running" | "complete" | "failed";

type BatchReportEntry = {
  key: string;
  type: "individual" | "aggregate";
  subjectId?: string;
  subjectName?: string;
  status: ReportStatus;
  filename: string;
  error?: string;
  bytes?: number;
  completedAt?: string;
};

type BatchJob = {
  id: string;
  cycleId: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  reports: BatchReportEntry[];
  files: Map<string, Buffer>;
};

const jobs = new Map<string, BatchJob>();
type Admin = SupabaseClient;
type Caller = { userId: string; employeeId: string; orgId: string; role: string };

function pdfDocument(element: React.ReactElement): Parameters<typeof renderToBuffer>[0] {
  return element as Parameters<typeof renderToBuffer>[0];
}

function getAdminClient(): Admin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getEmployee() {
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
  if (!user) return null;

  const { data } = await getAdminClient()
    .from("employees")
    .select("id, org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; org_id: string | null; platform_role: string | null }>();

  if (!data?.org_id || !data.platform_role) return null;
  return { userId: user.id, employeeId: data.id, orgId: data.org_id, role: data.platform_role } satisfies Caller;
}

async function assertCanManage(cycleId: string) {
  const caller = await getEmployee();
  if (!caller) return { caller: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canManageReportState(caller.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data } = await getAdminClient()
    .from("assessment_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("org_id", caller.orgId)
    .maybeSingle();

  if (!data) return { error: NextResponse.json({ error: "Cycle not found" }, { status: 404 }) };
  return { caller, error: null };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

function publicJob(job: BatchJob, request: NextRequest) {
  const origin = request.nextUrl.origin;
  const reports = job.reports.map(({ key, ...entry }) => ({
    ...entry,
    key,
    downloadUrl: entry.status === "complete"
      ? `${origin}/api/assessments/reports/pdf/batch?jobId=${encodeURIComponent(job.id)}&file=${encodeURIComponent(key)}`
      : null,
  }));

  return {
    jobId: job.id,
    cycleId: job.cycleId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    total: reports.length,
    complete: reports.filter((entry) => entry.status === "complete").length,
    failed: reports.filter((entry) => entry.status === "failed").length,
    reports,
  };
}

async function runJob(job: BatchJob) {
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  const data = await loadPdfReportData(getAdminClient(), job.cycleId);
  const generatedAt = new Date().toISOString();

  for (const entry of job.reports) {
    if (entry.status === "complete") continue;

    entry.status = "running";
    entry.error = undefined;
    job.updatedAt = new Date().toISOString();

    try {
      if (entry.type === "aggregate") {
        const report = buildMockAggregateReport(data, generatedAt);
        const buffer = await renderToBuffer(pdfDocument(React.createElement(AggregateAssessmentReportDocument, { report })));
        job.files.set(entry.key, buffer);
        entry.bytes = buffer.byteLength;
      } else if (entry.subjectId) {
        const report = buildMockIndividualReport(data, entry.subjectId, generatedAt);
        const buffer = await renderToBuffer(pdfDocument(React.createElement(IndividualAssessmentReportDocument, { report })));
        job.files.set(entry.key, buffer);
        entry.bytes = buffer.byteLength;
      }
      entry.status = "complete";
      entry.completedAt = new Date().toISOString();
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : "Report failed";
    }
  }

  job.status = job.reports.some((entry) => entry.status === "failed") ? "failed" : "complete";
  job.updatedAt = new Date().toISOString();
}

async function logBatchExport(input: {
  admin: Admin;
  request: NextRequest;
  caller: Caller;
  job: BatchJob;
  entry: BatchReportEntry;
}) {
  const ip = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? input.request.headers.get("x-real-ip")
    ?? null;
  await input.admin.from("assessment_audit_events").insert({
    cycle_id: input.job.cycleId,
    subject_id: input.entry.subjectId ?? null,
    action: "report_exported",
    metadata: {
      actorUserId: input.caller.userId,
      actorEmployeeId: input.caller.employeeId,
      actorRole: input.caller.role,
      ip,
      userAgent: input.request.headers.get("user-agent"),
      reportType: input.entry.type,
      batchJobId: input.job.id,
      filename: input.entry.filename,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { cycleId?: string; jobId?: string };
  if (!body.cycleId && !body.jobId) {
    return NextResponse.json({ error: "cycleId or jobId required" }, { status: 400 });
  }

  const existingJob = body.jobId ? jobs.get(body.jobId) : null;
  const cycleId = body.cycleId ?? existingJob?.cycleId;
  if (!cycleId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const access = await assertCanManage(cycleId);
  if (access.error) return access.error;

  let job = existingJob;
  if (!job) {
    const data = await loadPdfReportData(getAdminClient(), cycleId);
    const now = new Date().toISOString();
    const reports: BatchReportEntry[] = data.subjects.map((subject) => ({
      key: `individual:${subject.id}`,
      type: "individual",
      subjectId: subject.id,
      subjectName: subject.name,
      status: "pending",
      filename: `${slug(subject.name)}-360-report.pdf`,
    }));
    reports.push({
      key: "aggregate",
      type: "aggregate",
      status: "pending",
      filename: `${slug(data.cycle.name)}-aggregate-360-report.pdf`,
    });
    job = {
      id: randomUUID(),
      cycleId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reports,
      files: new Map(),
    };
    jobs.set(job.id, job);
  }

  await runJob(job);
  return NextResponse.json(publicJob(job, request), { status: 202 });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const file = request.nextUrl.searchParams.get("file");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });

  const access = await assertCanManage(job.cycleId);
  if (access.error) return access.error;

  if (!file) {
    return NextResponse.json(publicJob(job, request));
  }

  const entry = job.reports.find((report) => report.key === file);
  const buffer = job.files.get(file);
  if (!entry || !buffer) {
    return NextResponse.json({ error: "PDF not ready" }, { status: 404 });
  }

  await logBatchExport({ admin: getAdminClient(), request, caller: access.caller, job, entry });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${entry.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
