import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import {
  allowedTransitions,
  isReopen,
  isTransitionAllowed,
  reopenBlockedReason,
  reopenPatch,
} from "@/lib/assessmentLifecycle";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
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
    return NextResponse.json({ cycles: [] }, { status: 200 });
  }

  const { data: cycles } = await admin
    .from("assessment_cycles")
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  // Each cycle carries what it has collected and where it may go next, so a
  // console can disable an impossible action and say why, rather than offering
  // a button that answers 409. An organisation has a handful of cycles, so the
  // per-cycle counts are cheap; they are head-only and run in parallel.
  const enriched = await Promise.all((cycles ?? []).map(async (cycle) => {
    const [responses, submitted, released] = await Promise.all([
      admin.from("assessment_responses").select("id", { count: "exact", head: true }).eq("cycle_id", cycle.id),
      admin
        .from("assessment_reviewers")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .eq("status", "submitted"),
      admin
        .from("assessment_reports")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .eq("report_status", "released"),
    ]);

    const collected = {
      responseCount: responses.count ?? 0,
      submittedReviewers: submitted.count ?? 0,
      releasedReports: released.count ?? 0,
    };

    return {
      ...cycle,
      collected,
      allowedTransitions: allowedTransitions(cycle.status),
      reopenBlockedReason: cycle.status === "closed"
        ? reopenBlockedReason({ status: cycle.status, ...collected })
        : null,
    };
  }));

  return NextResponse.json({ cycles: enriched });
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

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    clientContext?: string;
    status?: string;
    levels?: string[];
    startsOn?: string;
    closesOn?: string;
    reviewerWeights?: Record<string, number>;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("assessment_cycles")
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      client_context: body.clientContext ?? "",
      status: body.status ?? "setup",
      levels: body.levels ?? ["director", "assistant_director"],
      starts_on: body.startsOn ?? null,
      closes_on: body.closesOn ?? null,
      reviewer_weights: body.reviewerWeights ?? {
        line_manager: 30,
        direct_report: 25,
        colleague: 25,
        customer: 20,
      },
    })
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cycle: data }, { status: 201 });
}

/**
 * Moves a cycle through its lifecycle.
 *
 * Until now a cycle kept whatever status it was created with forever: the launch
 * route could take it from setup to collecting, and nothing could ever close it
 * except the retention purge. HR had no way to say "collection is over".
 *
 * Closing does not retrospectively reject anything — submissions already stop at
 * closes_on. What it changes is intent, which is what the reminder cron and the
 * completion views read.
 *
 * The transition table and the reopen rule now live in `assessmentLifecycle`, so
 * the same rules can be unit-tested and shown in the UI before a button is
 * pressed rather than only discovered from a 409.
 */

export async function PATCH(request: NextRequest) {
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
  const role = (employee as { platform_role?: string } | null)?.platform_role;

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { cycleId?: string; status?: string; closesOn?: string };
  if (!body.cycleId || !body.status) {
    return NextResponse.json({ error: "cycleId and status are required" }, { status: 400 });
  }

  const { data: cycle } = await admin
    .from("assessment_cycles")
    .select("id, status")
    .eq("id", body.cycleId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; status: string }>();

  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  if (cycle.status === body.status) {
    return NextResponse.json({ cycle, unchanged: true });
  }

  const allowed = allowedTransitions(cycle.status);
  if (!isTransitionAllowed(cycle.status, body.status)) {
    return NextResponse.json(
      {
        error: `A ${cycle.status} cycle cannot become ${body.status}.`,
        allowed,
      },
      { status: 409 },
    );
  }

  // Reopening is the one transition that can destroy meaning rather than just
  // change intent, so it is checked against what the cycle actually holds. RLS
  // cannot help here — this route reads and writes with the service-role client
  // — so the rule is enforced in full, in code, before the update runs.
  const reopening = isReopen(cycle.status, body.status);
  if (reopening) {
    const [responses, submitted, released] = await Promise.all([
      admin.from("assessment_responses").select("id", { count: "exact", head: true }).eq("cycle_id", cycle.id),
      admin
        .from("assessment_reviewers")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .eq("status", "submitted"),
      admin
        .from("assessment_reports")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .eq("report_status", "released"),
    ]);

    if (responses.error || submitted.error || released.error) {
      // Failing open here would reopen a cycle we could not prove was empty.
      return NextResponse.json(
        { error: "Could not confirm this cycle is empty, so it was not reopened. Try again." },
        { status: 503 },
      );
    }

    const blocked = reopenBlockedReason({
      status: cycle.status,
      responseCount: responses.count ?? 0,
      submittedReviewers: submitted.count ?? 0,
      releasedReports: released.count ?? 0,
    });

    if (blocked) {
      return NextResponse.json({ error: blocked, allowed: [] }, { status: 409 });
    }
  }

  const { data, error } = await admin
    .from("assessment_cycles")
    .update({
      status: body.status,
      // Closing early should also shut the submission window, or raters could
      // keep answering a cycle HR considers finished.
      ...(body.status === "closed" && body.closesOn !== undefined ? { closes_on: body.closesOn } : {}),
      ...(reopening ? reopenPatch() : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycle.id)
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every lifecycle move is logged, because "who closed this and when" is the
  // first question asked when a rater says their link stopped working.
  await admin.from("assessment_audit_events").insert({
    cycle_id: cycle.id,
    action: reopening ? "assessment_cycle_reopened" : "assessment_cycle_status_changed",
    metadata: { from: cycle.status, to: body.status, actorId: user.id },
  });

  return NextResponse.json({ cycle: data, reopened: reopening });
}
