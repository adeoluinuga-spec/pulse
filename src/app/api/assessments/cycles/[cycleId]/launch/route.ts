import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";
import { assessmentCycleLaunchEmail, emailDeliveryFailureMessage, resolveReplyTo, sendPulseEmail } from "@/lib/pulseEmail";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type EmployeeContext = {
  org_id: string;
  platform_role: string | null;
};

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
};

function canLaunchAssessmentCycle(role?: string | null) {
  return role === "hr_admin" || role === "super_admin";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await params;
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle<EmployeeContext>();

  if (!employee || !canLaunchAssessmentCycle(employee.platform_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: cycle, error: cycleError } = await admin
    .from("assessment_cycles")
    .select("id, org_id, name, status, starts_on, closes_on, client_context, reviewer_weights, levels")
    .eq("id", cycleId)
    .eq("org_id", employee.org_id)
    .maybeSingle<{
      id: string;
      org_id: string;
      name: string | null;
      status: string | null;
      starts_on: string | null;
      closes_on: string | null;
      client_context: string | null;
      reviewer_weights: Record<string, number> | null;
      levels: string[] | null;
    }>();

  if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  if (cycle.status === "closed") {
    return NextResponse.json({ error: "Closed cycles cannot be launched again." }, { status: 409 });
  }

  if (cycle.status === "collecting") {
    return NextResponse.json({
      launched: false,
      notified: 0,
      emailed: 0,
      failed: 0,
      cycle,
      message: "This assessment cycle is already collecting feedback.",
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: launchedCycle, error: updateError } = await admin
    .from("assessment_cycles")
    .update({
      status: "collecting",
      starts_on: cycle.starts_on ?? today,
    })
    .eq("id", cycle.id)
    .eq("org_id", employee.org_id)
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const [employeesResult, orgResult, hrResult] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, email")
      .eq("org_id", employee.org_id)
      .returns<EmployeeRow[]>(),
    admin
      .from("organisations")
      .select("name, reply_to_email")
      .eq("id", employee.org_id)
      .maybeSingle<{ name: string | null; reply_to_email: string | null }>(),
    admin
      .from("employees")
      .select("email")
      .eq("org_id", employee.org_id)
      .eq("platform_role", "hr_admin")
      .returns<Array<{ email: string | null }>>(),
  ]);

  const employees = employeesResult.data ?? [];
  const cycleName = launchedCycle.name?.trim() || "a 360 assessment";
  const organisationName = orgResult.data?.name?.trim() || launchedCycle.client_context?.trim() || "Your organisation";
  const notificationRows = employees.map((row) => ({
    employee_id: row.id,
    title: "360 assessment cycle launched",
    body: `${cycleName} has started. If you are selected to provide feedback, you will receive a separate secure invitation.`,
    type: "assessment_cycle_launched",
    action_url: "/dashboard",
  }));

  let notified = 0;
  if (notificationRows.length > 0) {
    const { error: notificationError } = await admin.from("notifications").insert(notificationRows);
    if (!notificationError) notified = notificationRows.length;
  }

  const replyTo = resolveReplyTo({
    orgReplyTo: orgResult.data?.reply_to_email,
    hrAdminEmails: (hrResult.data ?? []).map((row) => row.email),
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const emailResults = await Promise.all(
    employees
      .filter((row) => Boolean(row.email?.trim()))
      .map(async (row) => {
        const message = assessmentCycleLaunchEmail({
          employeeName: row.name ?? "there",
          cycleName,
          organisationName,
          closesOn: launchedCycle.closes_on,
          appUrl,
        });
        const sent = await sendPulseEmail({
          to: row.email!.trim(),
          subject: message.subject,
          html: message.html,
          replyTo,
        });
        return sent;
      }),
  );

  const emailed = emailResults.filter((result) => result.ok).length;
  const failed = emailResults.length - emailed;
  const firstFailure = emailResults.find((result) => !result.ok);

  return NextResponse.json({
    launched: true,
    notified,
    emailed,
    failed,
    deliveryMessage: firstFailure && !firstFailure.ok ? emailDeliveryFailureMessage(firstFailure.error) : undefined,
    cycle: launchedCycle,
  });
}
