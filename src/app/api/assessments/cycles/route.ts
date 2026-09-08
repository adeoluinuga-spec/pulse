import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

  return NextResponse.json({ cycles: cycles ?? [] });
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
 */
const CYCLE_TRANSITIONS: Record<string, string[]> = {
  setup: ["collecting"],
  collecting: ["calibration", "closed"],
  calibration: ["collecting", "closed"],
  closed: [],
};

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

  const allowed = CYCLE_TRANSITIONS[cycle.status] ?? [];
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      {
        error: `A ${cycle.status} cycle cannot become ${body.status}.`,
        allowed,
      },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("assessment_cycles")
    .update({
      status: body.status,
      // Closing early should also shut the submission window, or raters could
      // keep answering a cycle HR considers finished.
      ...(body.status === "closed" && body.closesOn !== undefined ? { closes_on: body.closesOn } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycle.id)
    .select("id, name, status, starts_on, closes_on, reviewer_weights, levels, client_context")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cycle: data });
}
