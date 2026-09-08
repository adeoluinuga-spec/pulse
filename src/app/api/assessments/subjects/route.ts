import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { assessmentParticipantEmail, resolveReplyTo, sendPulseEmail } from "@/lib/pulseEmail";
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

  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id")
    .eq("id", body.cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string }>();

  if (!cycle) {
    return NextResponse.json({ error: "Assessment cycle not found" }, { status: 404 });
  }

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

  const notified = await notifyParticipant({
    admin,
    orgId,
    cycleId: body.cycleId,
    employeeId: matchedEmployee?.id ?? null,
    name: body.name.trim(),
    email,
    origin: request.nextUrl.origin,
  });

  return NextResponse.json({ subject: data, warning, notification: notified }, { status: 201 });
}

/**
 * Tells the participant they are being assessed — in-app and by email.
 *
 * Deliberately never throws: a mail or notification failure must not undo the
 * participant's creation, which has already succeeded. The outcome is reported
 * back to the caller instead, so HR can see who was not reached rather than
 * assuming everyone was.
 *
 * The in-app half needs employee_id, which is why an unlinked participant gets
 * the email only.
 */
async function notifyParticipant(input: {
  admin: ReturnType<typeof getAdminClient>;
  orgId: string;
  cycleId: string;
  employeeId: string | null;
  name: string;
  email: string;
  origin: string;
}): Promise<{ inApp: boolean; email: "sent" | "delivery_failed" | "skipped"; error?: string }> {
  try {
    const [cycleResult, orgResult, hrResult] = await Promise.all([
      input.admin
        .from("assessment_cycles")
        .select("name, closes_on")
        .eq("id", input.cycleId)
        .eq("org_id", input.orgId)
        .maybeSingle<{ name: string | null; closes_on: string | null }>(),
      input.admin
        .from("organisations")
        .select("name, reply_to_email")
        .eq("id", input.orgId)
        .maybeSingle<{ name: string | null; reply_to_email: string | null }>(),
      input.admin
        .from("employees")
        .select("email")
        .eq("org_id", input.orgId)
        .eq("platform_role", "hr_admin")
        .returns<Array<{ email: string | null }>>(),
    ]);

    const cycleName = cycleResult.data?.name?.trim() || "a 360 assessment";
    const organisationName = orgResult.data?.name?.trim() || "Your organisation";

    let inApp = false;
    if (input.employeeId) {
      const { error: notifyError } = await input.admin.from("notifications").insert({
        employee_id: input.employeeId,
        title: "You are part of a 360 assessment",
        body: `${organisationName} has included you in ${cycleName}. Colleagues will be asked for confidential feedback. Your report follows once it has been reviewed.`,
        type: "assessment_participant",
        action_url: "/dashboard",
      });
      inApp = !notifyError;
    }

    const message = assessmentParticipantEmail({
      participantName: input.name,
      cycleName,
      organisationName,
      closesOn: cycleResult.data?.closes_on ?? null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? input.origin,
    });

    const sent = await sendPulseEmail({
      to: input.email,
      subject: message.subject,
      html: message.html,
      replyTo: resolveReplyTo({
        orgReplyTo: orgResult.data?.reply_to_email,
        hrAdminEmails: (hrResult.data ?? []).map((row) => row.email),
      }),
    });

    return sent.ok
      ? { inApp, email: "sent" }
      : { inApp, email: "delivery_failed", error: sent.error };
  } catch (thrown) {
    return {
      inApp: false,
      email: "delivery_failed",
      error: thrown instanceof Error ? thrown.message : "Notification failed",
    };
  }
}
